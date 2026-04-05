"use strict";

const path = require("path");
const { spawn } = require("child_process");

const TASK_DIR_PATTERN = /Task output directory:\s*(.+)$/u;
const TASK_LOG_PATTERN = /Task log file:\s*(.+)$/u;

function buildCliArgs(projectRoot, options) {
  const configPath = options && options.configPath ? String(options.configPath) : path.join(projectRoot, "config.toml");
  const args = [path.join(projectRoot, "main.js"), "--config", configPath];

  if (options && options.morpheCliOnly) args.push("--morphe-cli");
  if (options && options.manual) args.push("--manual");
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
  if (options && options.manualPlan) {
    const raw = JSON.stringify(options.manualPlan);
    env.MORPHE_MANUAL_PLAN_B64 = Buffer.from(raw, "utf8").toString("base64");
  } else {
    delete env.MORPHE_MANUAL_PLAN_B64;
  }
  return env;
}

function createWebTaskId(now = Date.now()) {
  return `web-${now}-${Math.random().toString(16).slice(2, 8)}`;
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
  const taskId = createWebTaskId();
  const args = buildCliArgs(projectRoot, options);
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
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
    child,
  };
}

module.exports = {
  spawnCliTask,
};
