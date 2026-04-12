"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const TASK_DIR_PATTERN = /Task output directory:\s*(.+)$/u;
const TASK_LOG_PATTERN = /Task log file:\s*(.+)$/u;
const CLI_ENTRY_RELATIVE_PATH = path.join("cli", "main.js");

function fileExists(targetPath) {
  try {
    return fs.statSync(targetPath).isFile();
  } catch {
    return false;
  }
}

function buildCliArgs(projectRoot, options) {
  const configPath = options && options.configPath ? String(options.configPath) : path.join(projectRoot, "config.toml");
  const args = [path.join(projectRoot, CLI_ENTRY_RELATIVE_PATH), "--config", configPath];

  if (options && options.engineCliOnly) args.push("--engine-cli");
  if (options && options.downloadOnly) args.push("--download-only");
  if (options && options.patchesOnly) args.push("--patches-only");
  if (options && options.dryRun) args.push("--dry-run");
  if (options && options.force) args.push("--force");
  if (options && options.noTaskLog) args.push("--no-task-log");
  if (options && options.workspacePath) args.push("--workspace", String(options.workspacePath));
  if (options && options.migrateWorkspace) args.push("--migrate-workspace");

  return args;
}

function buildCliEnv(options) {
  const env = { ...process.env };
  // When desktop main process is Electron, force spawned CLI child to run in Node mode.
  // Otherwise the child may finish script logic but keep Electron process alive, causing
  // task status to remain "running" on the UI side.
  env.ELECTRON_RUN_AS_NODE = "1";
  if (options && options.signingKeystorePath) {
    const keystorePath = String(options.signingKeystorePath);
    env.PATCH_KEYSTORE_PATH = keystorePath;
  }
  return env;
}

function createDesktopTaskId(now = Date.now()) {
  return `desktop-${now}-${Math.random().toString(16).slice(2, 8)}`;
}

function wireStream(streamName, childStream, hooks) {
  let buffer = "";

  childStream.on("data", (chunk) => {
    const text = String(chunk || "");
    if (!text) return;

    hooks.onChunk({ stream: streamName, text });
    buffer += text;

    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() || "";

    for (const line of lines) {
      hooks.onLine({ stream: streamName, line });

      const dirMatch = line.match(TASK_DIR_PATTERN);
      if (dirMatch && dirMatch[1]) {
        hooks.onTaskOutputDir(String(dirMatch[1]).trim());
      }

      const logMatch = line.match(TASK_LOG_PATTERN);
      if (logMatch && logMatch[1]) {
        hooks.onTaskLogPath(String(logMatch[1]).trim());
      }
    }
  });

  childStream.on("end", () => {
    if (!buffer.trim()) return;
    hooks.onLine({ stream: streamName, line: buffer.trim() });
  });
}

function spawnCliTask(projectRoot, options, handlers) {
  const taskId = createDesktopTaskId();
  const args = buildCliArgs(projectRoot, options);
  const execPath = resolveCliExecPath();
  const cwd = resolveSpawnCwd(projectRoot, execPath);
  const child = spawn(execPath, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env: buildCliEnv(options),
  });

  const hooks = {
    onChunk: handlers && handlers.onChunk ? handlers.onChunk : () => {},
    onLine: handlers && handlers.onLine ? handlers.onLine : () => {},
    onTaskOutputDir: handlers && handlers.onTaskOutputDir ? handlers.onTaskOutputDir : () => {},
    onTaskLogPath: handlers && handlers.onTaskLogPath ? handlers.onTaskLogPath : () => {},
  };

  wireStream("stdout", child.stdout, hooks);
  wireStream("stderr", child.stderr, hooks);

  return {
    taskId,
    args,
    command: execPath,
    cwd,
    child,
  };
}

function resolveSpawnCwd(projectRoot, execPathInput = "") {
  const root = path.resolve(String(projectRoot || process.cwd()));

  // Electron can expose app.asar as a virtual directory, but OS-level spawn cwd
  // must be a real filesystem directory.
  if (isAsarPath(root)) {
    const resourcesDir = path.dirname(root);
    if (isDirectory(resourcesDir)) return resourcesDir;
  }
  if (isDirectory(root)) return root;

  // When packaged, projectRoot points to resources/app.asar (a file),
  // but child_process cwd must be a directory.
  if (root.toLowerCase().endsWith(".asar")) {
    const resourcesDir = path.dirname(root);
    if (isDirectory(resourcesDir)) return resourcesDir;
  }

  const fallback = process.resourcesPath ? String(process.resourcesPath) : process.cwd();
  if (isDirectory(fallback)) return fallback;
  const execDir = path.dirname(String(execPathInput || ""));
  if (isDirectory(execDir)) return execDir;
  return process.cwd();
}

function resolveCliExecPath(envInput = process.env, runtimeInput = {}) {
  const env = envInput && typeof envInput === "object" ? envInput : process.env;
  const runtime = runtimeInput && typeof runtimeInput === "object" ? runtimeInput : {};
  const platform = String(runtime.platform || process.platform);
  const processExecPath = String(runtime.execPath || process.execPath);
  const fileExistsFn = typeof runtime.fileExists === "function" ? runtime.fileExists : fileExists;
  const currentExec = processExecPath.trim();
  if (currentExec && fileExistsFn(currentExec)) {
    return currentExec;
  }
  const portableExecutable = String(env.PORTABLE_EXECUTABLE_FILE || "").trim();
  if (platform === "win32" && portableExecutable && fileExistsFn(portableExecutable)) {
    return portableExecutable;
  }
  return processExecPath;
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function isAsarPath(targetPath) {
  const normalized = String(targetPath || "").replace(/\\/g, "/").toLowerCase();
  return normalized === ".asar" || normalized.endsWith(".asar") || normalized.includes(".asar/");
}

module.exports = {
  spawnCliTask,
  resolveCliExecPath,
  resolveSpawnCwd,
};
