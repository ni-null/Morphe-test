#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");
const CHANNEL_ORDER = ["stable", "dev"];

function parseArgs(argv) {
  const options = {
    metadata: "./output/release-metadata.json",
    output: "./output/release-notes.md",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--metadata") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --metadata");
      }
      options.metadata = value;
      i += 1;
      continue;
    }
    if (arg === "--output") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      options.output = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function escapeCell(value) {
  return String(value || "").replace(/\|/gu, "\\|");
}

function displayChannel(channel) {
  const normalized = String(channel || "").trim().toLowerCase();
  if (normalized === "stable") return "Stable";
  if (normalized === "dev") return "Dev";
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function compareChannel(a, b) {
  const ai = CHANNEL_ORDER.indexOf(String(a || "").toLowerCase());
  const bi = CHANNEL_ORDER.indexOf(String(b || "").toLowerCase());
  const av = ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
  const bv = bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
  if (av !== bv) return av - bv;
  return String(a || "").localeCompare(String(b || ""));
}

function normalizeChannelRows(metadata, apps) {
  const fromMetadata = Array.isArray(metadata.channels) ? metadata.channels : [];
  if (fromMetadata.length > 0) {
    return fromMetadata.map((item) => {
      const channel = String(item.channel || "").toLowerCase() || "stable";
      const patchFiles = Array.isArray(item.patchFiles)
        ? item.patchFiles.map((name) => String(name || "").trim()).filter(Boolean)
        : [];
      return { channel, patchFiles };
    });
  }

  const grouped = new Map();
  for (const app of apps) {
    const channel = String(app.channel || "stable").toLowerCase();
    if (!grouped.has(channel)) {
      grouped.set(channel, new Set());
    }
    const patchFile = app.patchFileName || path.basename(String(app.patchPath || ""));
    if (patchFile) {
      grouped.get(channel).add(String(patchFile));
    }
  }
  return Array.from(grouped.entries()).map(([channel, patchFiles]) => ({
    channel,
    patchFiles: Array.from(patchFiles),
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const metadataPath = path.resolve(options.metadata);
  const outputPath = path.resolve(options.output);

  const raw = await fsp.readFile(metadataPath, "utf8");
  const metadata = JSON.parse(raw.replace(/^\uFEFF/u, ""));
  const apps = Array.isArray(metadata.apps) ? metadata.apps : [];
  if (apps.length === 0) {
    throw new Error(`No app records in metadata: ${metadataPath}`);
  }

  const patchCliMetadata = metadata.patchCli || null;
  const cliFile = patchCliMetadata && patchCliMetadata.fileName ? patchCliMetadata.fileName : "unknown";
  const channels = normalizeChannelRows(metadata, apps).sort((a, b) => compareChannel(a.channel, b.channel));
  const appsByChannel = new Map();
  for (const app of apps) {
    const channel = String(app.channel || "stable").toLowerCase();
    if (!appsByChannel.has(channel)) {
      appsByChannel.set(channel, []);
    }
    appsByChannel.get(channel).push(app);
  }

  const lines = [];
  if (metadata.generatedAt) {
    lines.push(`**Generated at:** \`${metadata.generatedAt}\``);
    lines.push("");
  }
  lines.push("| Channel | Type | Name / App | Output File |");
  lines.push("|---|---|---|---|");
  lines.push(`| Common | Tool File | ${escapeCell(cliFile)} | - |`);
  lines.push(
    "| Common | Requirement | [MicroG-RE](https://github.com/MorpheApp/MicroG-RE/releases) | - |",
  );

  for (const channelInfo of channels) {
    const channel = channelInfo.channel;
    const channelLabel = displayChannel(channel);
    const patchFiles = channelInfo.patchFiles;
    for (const patchFileName of patchFiles) {
      lines.push(`| ${channelLabel} | Patch File | ${escapeCell(patchFileName)} | - |`);
    }

    const channelApps = (appsByChannel.get(channel) || []).slice().sort((a, b) => {
      const aName = `${a.appName || ""}-${a.apkVersion || ""}`;
      const bName = `${b.appName || ""}-${b.apkVersion || ""}`;
      return aName.localeCompare(bName);
    });
    for (const app of channelApps) {
      const appName = app.appName || "unknown";
      const apkVersion = app.apkVersion || "unknown";
      const outputFile = app.outputApkPath ? path.basename(app.outputApkPath) : "unknown";
      const targetName = `${appName}-${apkVersion}`;
      lines.push(`| ${channelLabel} | Build Target | ${escapeCell(targetName)} | ${escapeCell(outputFile)} |`);
    }
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
