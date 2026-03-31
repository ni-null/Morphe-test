#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");

const CHANNELS = ["stable", "dev"];

function parseArgs(argv) {
  const options = {
    config: "config.toml",
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }
      options.config = value;
      i += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function channelLabel(channel) {
  const value = String(channel || "").toLowerCase();
  if (value === "stable") return "Stable";
  if (value === "dev") return "Dev";
  return value || "Unknown";
}

function isSectionLine(line) {
  return /^\s*\[[A-Za-z0-9_.-]+\]\s*$/u.test(line);
}

function getSectionName(line) {
  const match = String(line || "").match(/^\s*\[([A-Za-z0-9_.-]+)\]\s*$/u);
  return match ? String(match[1]).toLowerCase() : "";
}

function withPatchesMode(baseToml, mode) {
  const lines = String(baseToml || "").split(/\r?\n/u);
  const out = [];
  let inPatches = false;
  let hasPatchesSection = false;
  let wroteMode = false;

  for (const line of lines) {
    if (isSectionLine(line)) {
      if (inPatches && !wroteMode) {
        out.push(`mode = "${mode}"`);
        wroteMode = true;
      }
      const section = getSectionName(line);
      inPatches = section === "patches";
      if (inPatches) {
        hasPatchesSection = true;
        wroteMode = false;
      }
      out.push(line);
      continue;
    }

    if (inPatches && /^\s*mode\s*=/u.test(line)) {
      out.push(`mode = "${mode}"`);
      wroteMode = true;
      continue;
    }

    out.push(line);
  }

  if (inPatches && !wroteMode) {
    out.push(`mode = "${mode}"`);
  }

  if (!hasPatchesSection) {
    if (out.length > 0 && String(out[out.length - 1]).trim() !== "") {
      out.push("");
    }
    out.push("[patches]");
    out.push(`mode = "${mode}"`);
  }

  return `${out.join("\n")}\n`;
}

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", (err) => reject(new Error(`Failed to start node: ${err.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}: node ${args.join(" ")}`));
        return;
      }
      resolve();
    });
  });
}

function uniquePatchFiles(apps) {
  const values = [];
  const seen = new Set();
  for (const app of apps) {
    const patchFile = app && app.patchFileName ? String(app.patchFileName) : "";
    if (!patchFile || seen.has(patchFile)) continue;
    seen.add(patchFile);
    values.push(patchFile);
  }
  return values;
}

function mergeMetadata(configPath, channelMetas) {
  const mergedApps = [];
  const channels = [];

  for (const item of channelMetas) {
    const channel = item.channel;
    const metadata = item.metadata || {};
    const apps = Array.isArray(metadata.apps) ? metadata.apps : [];
    const patchFiles = uniquePatchFiles(apps);

    channels.push({
      channel,
      channelLabel: channelLabel(channel),
      patchFiles,
    });

    for (const app of apps) {
      mergedApps.push({
        ...app,
        channel,
        channelLabel: channelLabel(channel),
      });
    }
  }

  const firstWithCli = channelMetas.find((item) => item.metadata && item.metadata.morpheCli);

  return {
    generatedAt: new Date().toISOString(),
    configPath: path.resolve(configPath),
    morpheCli: firstWithCli ? firstWithCli.metadata.morpheCli : null,
    channels,
    apps: mergedApps,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outputDir = path.join(cwd, "output");
  const mainPath = path.join(cwd, "main.js");
  const baseConfigPath = path.resolve(cwd, options.config);

  const baseConfig = await fsp.readFile(baseConfigPath, "utf8");
  await fsp.mkdir(outputDir, { recursive: true });

  const channelMetas = [];
  const tempConfigPaths = [];

  try {
    for (const channel of CHANNELS) {
      const tempConfigPath = path.join(outputDir, `_tmp-config-${channel}.toml`);
      tempConfigPaths.push(tempConfigPath);

      const channelConfig = withPatchesMode(baseConfig, channel);
      await fsp.writeFile(tempConfigPath, channelConfig, "utf8");

      const args = [mainPath, "--config", tempConfigPath];
      if (options.force) {
        args.push("--force");
      }
      await runNode(args, cwd);

      const metadataPath = path.join(outputDir, "release-metadata.json");
      const raw = await fsp.readFile(metadataPath, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/u, ""));

      const channelMetadataPath = path.join(outputDir, `release-metadata-${channel}.json`);
      await fsp.writeFile(channelMetadataPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

      channelMetas.push({
        channel,
        metadata: parsed,
      });
    }

    const merged = mergeMetadata(baseConfigPath, channelMetas);
    const mergedPath = path.join(outputDir, "release-metadata.json");
    await fsp.writeFile(mergedPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    console.log(mergedPath);
  } finally {
    for (const tempConfigPath of tempConfigPaths) {
      try {
        await fsp.unlink(tempConfigPath);
      } catch {
        // ignore cleanup failure
      }
    }
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

