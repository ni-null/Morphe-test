#!/usr/bin/env node
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const https = require("https");
const http = require("http");

function parseArgs(argv) {
  const options = {
    name: "",
    url: "",
    cacheDir: "./downloads/microg",
    outputDir: "./output",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--name") {
      options.name = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--url") {
      options.url = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--cache-dir") {
      options.cacheDir = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = String(argv[i + 1] || "");
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.name || !options.url) {
    throw new Error("Both --name and --url are required.");
  }
  return options;
}

function fileExists(filePath) {
  return fsp.access(filePath, fs.constants.F_OK).then(() => true).catch(() => false);
}

function downloadToFile(url, outFile, token, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error(`Too many redirects while downloading: ${url}`));
      return;
    }
    const client = String(url).toLowerCase().startsWith("https://") ? https : http;
    const headers = { "User-Agent": "patcher-ci-microg-download" };
    if (token && String(token).trim()) {
      headers.Authorization = `Bearer ${String(token).trim()}`;
    }
    const req = client.get(url, { headers }, (res) => {
      const status = Number(res.statusCode || 0);
      if (status >= 300 && status < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        downloadToFile(next, outFile, token, redirects + 1).then(resolve).catch(reject);
        return;
      }
      if (status < 200 || status >= 300) {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          reject(new Error(`Download failed (${status}): ${url}\n${Buffer.concat(chunks).toString("utf8").slice(0, 300)}`));
        });
        return;
      }

      const tmpFile = `${outFile}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const stream = fs.createWriteStream(tmpFile);
      res.pipe(stream);
      stream.on("finish", async () => {
        stream.close(async () => {
          try {
            const stat = await fsp.stat(tmpFile);
            if (!stat || stat.size <= 0) {
              await fsp.unlink(tmpFile);
              reject(new Error(`Downloaded file is empty: ${url}`));
              return;
            }
            if (await fileExists(outFile)) {
              await fsp.unlink(outFile);
            }
            await fsp.rename(tmpFile, outFile);
            resolve();
          } catch (err) {
            try { await fsp.unlink(tmpFile); } catch {}
            reject(err);
          }
        });
      });
      stream.on("error", async (err) => {
        try { await fsp.unlink(tmpFile); } catch {}
        reject(err);
      });
    });
    req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
  });
}

async function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await fsp.appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || "";

  const cacheDir = path.resolve(options.cacheDir);
  const outputDir = path.resolve(options.outputDir);
  const cachePath = path.join(cacheDir, path.basename(options.name));
  const outPath = path.join(outputDir, path.basename(options.name));

  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.mkdir(outputDir, { recursive: true });

  const cached = await fileExists(cachePath);
  if (!cached) {
    console.log(`Download MicroG -> ${cachePath}`);
    await downloadToFile(options.url, cachePath, token);
  } else {
    console.log(`Use cached MicroG -> ${cachePath}`);
  }

  await fsp.copyFile(cachePath, outPath);
  console.log(`MicroG copied to output -> ${outPath}`);
  await setOutput("output_file", outPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

