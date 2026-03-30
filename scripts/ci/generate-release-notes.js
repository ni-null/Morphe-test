#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");

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

function extractCliVersion(fileName) {
  const name = String(fileName || "");
  const match = name.match(/^morphe-cli-(.+)-all\.jar$/iu);
  if (match) return match[1];
  return path.basename(name, path.extname(name)) || "unknown";
}

function extractPatchVersion(fileName) {
  const name = String(fileName || "");
  const match = name.match(/^patches-(.+)\.mpp$/iu);
  if (match) return match[1];
  return path.basename(name, path.extname(name)) || "unknown";
}

function escapeCell(value) {
  return String(value || "").replace(/\|/gu, "\\|");
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

  const cliFile = metadata.morpheCli && metadata.morpheCli.fileName ? metadata.morpheCli.fileName : "unknown";
  const cliVersion = extractCliVersion(cliFile);

  const lines = [];
  lines.push("# Morphe Auto Patch Release");
  lines.push("");
  lines.push("## Versions");
  lines.push("");
  lines.push(`- morphe-cli: \`${cliVersion}\` (${cliFile})`);
  lines.push("");
  lines.push("| App | APK Version | Patches Version | Output File |");
  lines.push("| --- | --- | --- | --- |");

  for (const app of apps) {
    const appName = app.appName || "unknown";
    const apkVersion = app.apkVersion || "unknown";
    const patchFileName = app.patchFileName || path.basename(String(app.patchPath || ""));
    const patchVersion = extractPatchVersion(patchFileName);
    const outputFile = app.outputApkPath ? path.basename(app.outputApkPath) : "unknown";

    lines.push(
      `| ${escapeCell(appName)} | ${escapeCell(apkVersion)} | ${escapeCell(patchVersion)} (${escapeCell(
        patchFileName,
      )}) | ${escapeCell(outputFile)} |`,
    );
  }

  lines.push("");
  lines.push("## Build");
  lines.push("");
  if (metadata.generatedAt) {
    lines.push(`- generated_at: \`${metadata.generatedAt}\``);
  }
  if (metadata.configPath) {
    lines.push(`- config: \`${metadata.configPath}\``);
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
