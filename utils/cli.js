"use strict";

function printUsage() {
  console.log(`
Usage:
  node ./cli/main.js [options]

Options:
  -c, --config <path>  config.toml path (default: ./config.toml)
      --engine-cli     test engine-cli jar module only (skip APK/patches flow)
      --download-only  test APK module only (skip patches module)
      --patches-only   test patches module only (skip APK/patch flow)
      --dry-run        print actions without downloading/patching
      --force          redownload existing APK/.mpp/.jar
      --clear-cache    clear workspace cache directory before run
      --no-task-log    disable task folder/log persistence for this run
      --workspace <path>      set workspace directory for downloads/patches/output/runtime
      --migrate-workspace     migrate legacy root folders (downloads/patches/engine-cli/output) into workspace
  -h, --help           show this help
`);
}

function parseArgs(argv) {
  const options = {
    configPath: "./config.toml",
    engineCliOnly: false,
    downloadOnly: false,
    patchesOnly: false,
    dryRun: false,
    force: false,
    clearCache: false,
    noTaskLog: false,
    workspacePath: "",
    migrateWorkspace: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-c" || arg === "--config") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.configPath = value;
      i += 1;
      continue;
    }
    if (arg === "--download-only") {
      options.downloadOnly = true;
      continue;
    }
    if (arg === "--engine-cli") {
      options.engineCliOnly = true;
      continue;
    }
    if (arg === "--patches-only") {
      options.patchesOnly = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--clear-cache") {
      options.clearCache = true;
      continue;
    }
    if (arg === "--no-task-log") {
      options.noTaskLog = true;
      continue;
    }
    if (arg === "--workspace") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.workspacePath = value;
      i += 1;
      continue;
    }
    if (arg === "--migrate-workspace") {
      options.migrateWorkspace = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

module.exports = {
  printUsage,
  parseArgs,
};
