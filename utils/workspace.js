"use strict";

const os = require("os");
const path = require("path");
const fsp = require("fs").promises;

function hasValue(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function getDefaultWorkspaceRoot(env = process.env) {
  const appName = "MorphePatcher";

  // Portable mode: use relative workspace folder next to executable/source
  const isPortable = env.MORPHE_PORTABLE === "1" ||
    env.PORTABLE_EXECUTABLE_DIR ||
    env.DESKTOP_DEV ||
    (process.resourcesPath && process.resourcesPath);
  if (isPortable) {
    const exeDir = env.PORTABLE_EXECUTABLE_DIR || process.cwd();
    return path.resolve(exeDir, "workspace");
  }

  if (process.platform === "win32") {
    const base = hasValue(env.LOCALAPPDATA)
      ? String(env.LOCALAPPDATA).trim()
      : path.join(os.homedir(), "AppData", "Local");
    return path.resolve(base, appName, "workspace");
  }
  if (process.platform === "darwin") {
    return path.resolve(os.homedir(), "Library", "Application Support", appName, "workspace");
  }
  const dataHome = hasValue(env.XDG_DATA_HOME)
    ? String(env.XDG_DATA_HOME).trim()
    : path.resolve(os.homedir(), ".local", "share");
  return path.resolve(dataHome, appName, "workspace");
}

function resolveWorkspaceRoot(params = {}) {
  const {
    cliWorkspace,
    envWorkspace,
    configWorkspace,
    cwd = process.cwd(),
    env = process.env,
  } = params;

  const picked = hasValue(cliWorkspace)
    ? String(cliWorkspace).trim()
    : hasValue(envWorkspace)
      ? String(envWorkspace).trim()
      : hasValue(configWorkspace)
        ? String(configWorkspace).trim()
        : null;

  if (!picked) {
    return getDefaultWorkspaceRoot(env);
  }
  if (path.isAbsolute(picked)) {
    return path.normalize(picked);
  }
  return path.resolve(cwd, picked);
}

function buildWorkspacePaths(workspaceRoot) {
  const root = path.resolve(String(workspaceRoot || ""));
  if (!root) {
    throw new Error("Workspace root is empty.");
  }
  return {
    root,
    downloads: path.join(root, "downloads"),
    patches: path.join(root, "patches"),
    morpheCli: path.join(root, "morphe-cli"),
    output: path.join(root, "output"),
    cache: path.join(root, "cache"),
    runtime: path.join(root, "runtime"),
  };
}

async function ensureWorkspaceDirs(workspacePaths) {
  await fsp.mkdir(workspacePaths.root, { recursive: true });
  await fsp.mkdir(workspacePaths.downloads, { recursive: true });
  await fsp.mkdir(workspacePaths.patches, { recursive: true });
  await fsp.mkdir(workspacePaths.morpheCli, { recursive: true });
  await fsp.mkdir(workspacePaths.output, { recursive: true });
  await fsp.mkdir(workspacePaths.cache, { recursive: true });
  await fsp.mkdir(workspacePaths.runtime, { recursive: true });
}

async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function moveDirContents(sourceDir, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(sourceDir, entry.name);
    const dest = path.join(targetDir, entry.name);
    const destExists = await pathExists(dest);
    if (destExists) {
      if (entry.isDirectory()) {
        await moveDirContents(src, dest);
        try {
          await fsp.rm(src, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failure for nested legacy folders.
        }
      }
      continue;
    }
    try {
      await fsp.rename(src, dest);
    } catch {
      await fsp.cp(src, dest, { recursive: true, force: false, errorOnExist: false });
      await fsp.rm(src, { recursive: true, force: true });
    }
  }
}

async function migrateLegacyDirs(legacyRoot, workspacePaths, logInfo) {
  const fromRoot = path.resolve(String(legacyRoot || ""));
  const mapping = [
    ["downloads", workspacePaths.downloads],
    ["patches", workspacePaths.patches],
    ["morphe-cli", workspacePaths.morpheCli],
    ["output", workspacePaths.output],
    ["cache", workspacePaths.cache],
  ];

  const migrated = [];
  for (const [legacyName, targetPath] of mapping) {
    const legacyPath = path.join(fromRoot, legacyName);
    if (!(await pathExists(legacyPath))) {
      continue;
    }
    if (path.resolve(legacyPath) === path.resolve(targetPath)) {
      continue;
    }
    await moveDirContents(legacyPath, targetPath);
    try {
      await fsp.rm(legacyPath, { recursive: true, force: true });
    } catch {
      // Ignore root cleanup failure (e.g. locked files); data has been moved/merged already.
    }
    migrated.push({ name: legacyName, from: legacyPath, to: targetPath });
    if (typeof logInfo === "function") {
      logInfo(`Migrated legacy ${legacyName}: ${legacyPath} -> ${targetPath}`);
    }
  }
  return migrated;
}

module.exports = {
  getDefaultWorkspaceRoot,
  resolveWorkspaceRoot,
  buildWorkspacePaths,
  ensureWorkspaceDirs,
  migrateLegacyDirs,
};
