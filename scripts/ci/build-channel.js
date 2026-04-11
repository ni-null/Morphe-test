#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const options = {
    config: "config.toml",
    channel: "",
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --config");
      options.config = value;
      i += 1;
      continue;
    }
    if (arg === "--channel") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --channel");
      options.channel = String(value).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.channel || !["stable", "dev"].includes(options.channel)) {
    throw new Error("Invalid --channel. Allowed: stable, dev.");
  }
  return options;
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
    if (out.length > 0 && String(out[out.length - 1]).trim() !== "") out.push("");
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
  const seen = new Set();
  const values = [];
  for (const app of apps) {
    const patchFile = String(app && app.patchFileName ? app.patchFileName : "").trim();
    if (!patchFile || seen.has(patchFile)) continue;
    seen.add(patchFile);
    values.push(patchFile);
  }
  return values;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const mainPath = path.join(cwd, "cli", "main.js");
  const baseConfigPath = path.resolve(cwd, options.config);
  const configDir = path.dirname(baseConfigPath);
  const outputDir = path.resolve(configDir, "output");
  const tempConfigPath = path.join(configDir, `_tmp-config-${options.channel}.toml`);

  const baseConfig = await fsp.readFile(baseConfigPath, "utf8");
  const channelConfig = withPatchesMode(baseConfig, options.channel);
  await fsp.writeFile(tempConfigPath, channelConfig, "utf8");

  try {
    const args = [mainPath, "--config", tempConfigPath];
    if (options.force) args.push("--force");
    await runNode(args, cwd);

    const metadataPath = path.join(outputDir, "release-metadata.json");
    const raw = await fsp.readFile(metadataPath, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/u, ""));
    const apps = Array.isArray(parsed.apps) ? parsed.apps : [];

    const channelMetadata = {
      channel: options.channel,
      generatedAt: new Date().toISOString(),
      configPath: parsed.configPath || baseConfigPath,
      patchCli: parsed.patchCli || null,
      patchFiles: uniquePatchFiles(apps),
      apps: apps.map((app) => ({
        ...app,
        channel: options.channel,
      })),
    };

    const channelMetadataPath = path.join(outputDir, `release-metadata-${options.channel}.json`);
    await fsp.writeFile(channelMetadataPath, `${JSON.stringify(channelMetadata, null, 2)}\n`, "utf8");
    console.log(channelMetadataPath);
  } finally {
    try {
      await fsp.unlink(tempConfigPath);
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

