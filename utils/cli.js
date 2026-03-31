"use strict";

function printUsage() {
  console.log(`
Usage:
  node ./main.js [options]
  node ./scripts/run-auto-patch.js [options]

Options:
  -c, --config <path>  config.toml path (default: ./config.toml)
      --morphe-cli     test morphe-cli jar module only (skip APK/patches flow)
      --download-only  test APK module only (skip patches module)
      --patches-only   test patches module only (skip APK/patch flow)
      --dry-run        print actions without downloading/patching
      --force          redownload existing APK/.mpp/.jar
  -h, --help           show this help
`);
}

function parseArgs(argv) {
  const options = {
    configPath: "./config.toml",
    morpheCliOnly: false,
    downloadOnly: false,
    patchesOnly: false,
    dryRun: false,
    force: false,
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
    if (arg === "--morphe-cli") {
      options.morpheCliOnly = true;
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
