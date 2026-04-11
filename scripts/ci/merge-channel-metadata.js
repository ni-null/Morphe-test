#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const options = {
    output: "./output/release-metadata.json",
    config: "config.toml",
    input: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--output") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --output");
      options.output = value;
      i += 1;
      continue;
    }
    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --config");
      options.config = value;
      i += 1;
      continue;
    }
    if (arg === "--input") {
      const value = argv[i + 1];
      if (!value) throw new Error("Missing value for --input");
      options.input.push(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (options.input.length === 0) {
    throw new Error("At least one --input is required.");
  }
  return options;
}

function normalizeChannel(channel) {
  const value = String(channel || "").trim().toLowerCase();
  if (value === "stable" || value === "dev") return value;
  return value || "unknown";
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/u, ""));
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveInputPath(inputPath, cwd) {
  const tried = [];
  const basename = path.basename(String(inputPath || "").trim());
  const candidates = [
    path.resolve(cwd, inputPath),
    path.resolve(cwd, basename),
    path.resolve(cwd, "output", basename),
    path.resolve(cwd, "output", "output", basename),
  ];

  for (const candidate of candidates) {
    if (!candidate || tried.includes(candidate)) continue;
    tried.push(candidate);
    if (await fileExists(candidate)) return candidate;
  }

  throw new Error(
    `Metadata input not found: ${inputPath}\nTried:\n- ${tried.join("\n- ")}`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const channelFiles = [];
  for (const item of options.input) {
    channelFiles.push(await resolveInputPath(item, cwd));
  }
  const channelMetadata = await Promise.all(channelFiles.map((filePath) => readJson(filePath)));

  const channels = [];
  const apps = [];
  let patchCli = null;

  for (const item of channelMetadata) {
    const channel = normalizeChannel(item.channel);
    const patchFiles = Array.isArray(item.patchFiles)
      ? item.patchFiles.map((file) => String(file || "").trim()).filter(Boolean)
      : [];
    channels.push({
      channel,
      channelLabel: channel === "stable" ? "Stable" : channel === "dev" ? "Dev" : channel,
      patchFiles: [...new Set(patchFiles)],
    });

    const patchCliMeta = item && typeof item === "object" ? item.patchCli || null : null;
    if (!patchCli && patchCliMeta) {
      patchCli = patchCliMeta;
    }

    const itemApps = Array.isArray(item.apps) ? item.apps : [];
    for (const app of itemApps) {
      apps.push({
        ...app,
        channel,
      });
    }
  }

  const merged = {
    generatedAt: new Date().toISOString(),
    configPath: path.resolve(options.config),
    patchCli,
    channels,
    apps,
  };

  const outputPath = path.resolve(options.output);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(outputPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
