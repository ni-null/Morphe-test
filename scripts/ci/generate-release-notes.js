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
  const patchFiles = [...new Set(
    apps
      .map((app) => app.patchFileName || path.basename(String(app.patchPath || "")))
      .filter(Boolean),
  )];

  const lines = [];
  lines.push("| Type | Name / App | Output File |");
  lines.push("|---|---|---|");
  lines.push(`| Tool File | ${escapeCell(cliFile)} | - |`);

  for (const patchFileName of patchFiles) {
    lines.push(`| Patch File | ${escapeCell(patchFileName)} | - |`);
  }

  for (const app of apps) {
    const appName = app.appName || "unknown";
    const apkVersion = app.apkVersion || "unknown";
    const outputFile = app.outputApkPath ? path.basename(app.outputApkPath) : "unknown";
    const targetName = `${appName}-${apkVersion}`;
    lines.push(
      `| Build Target | ${escapeCell(targetName)} | ${escapeCell(outputFile)} |`,
    );
  }

  lines.push("");
  if (metadata.generatedAt) {
    lines.push(`- generated_at: \`${metadata.generatedAt}\``);
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
