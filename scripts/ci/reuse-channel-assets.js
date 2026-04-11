#!/usr/bin/env node
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const https = require("https");
const http = require("http");

function parseArgs(argv) {
  const options = {
    channel: "",
    releaseId: "",
    patchFile: "",
    cliFile: "",
    outputDir: "./output",
    cacheDir: "./downloads/release-assets",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--channel") {
      options.channel = String(argv[i + 1] || "").trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--release-id") {
      options.releaseId = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--patch-file") {
      options.patchFile = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--cli-file") {
      options.cliFile = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (arg === "--cache-dir") {
      options.cacheDir = String(argv[i + 1] || "").trim();
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.channel || !["stable", "dev"].includes(options.channel)) {
    throw new Error("Invalid --channel. Allowed: stable, dev.");
  }
  if (!options.releaseId) throw new Error("Missing --release-id");
  if (!options.patchFile) throw new Error("Missing --patch-file");
  if (!options.cliFile) throw new Error("Missing --cli-file");
  return options;
}

function fileExists(filePath) {
  return fsp.access(filePath, fs.constants.F_OK).then(() => true).catch(() => false);
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "patcher-ci-reuse-assets",
      Accept: "application/vnd.github+json",
    };
    if (token && String(token).trim()) {
      headers.Authorization = `Bearer ${String(token).trim()}`;
    }
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const status = Number(res.statusCode || 0);
        if (status < 200 || status >= 300) {
          reject(new Error(`GitHub API ${status}: ${url}\n${body.slice(0, 400)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
        }
      });
    });
    req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
  });
}

function downloadToFile(url, outFile, token, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) {
      reject(new Error(`Too many redirects: ${url}`));
      return;
    }
    const client = String(url).toLowerCase().startsWith("https://") ? https : http;
    const headers = { "User-Agent": "patcher-ci-reuse-assets-download" };
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
        res.on("end", () => reject(new Error(`Download failed (${status}): ${url}\n${Buffer.concat(chunks).toString("utf8").slice(0, 300)}`)));
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
              reject(new Error(`Downloaded empty file: ${url}`));
              return;
            }
            if (await fileExists(outFile)) await fsp.unlink(outFile);
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

function parseAppFromPatchedName(fileName, patchBase) {
  const name = String(fileName || "").trim();
  const suffix = `-${patchBase}.apk`;
  if (!name.startsWith("patcher-") || !name.endsWith(suffix)) {
    return null;
  }
  const middle = name.slice("patcher-".length, -suffix.length);
  const match = middle.match(/^(.+)-([0-9][0-9A-Za-z.\-]*)$/u);
  if (!match) {
    return null;
  }
  return {
    appName: match[1],
    apkVersion: match[2],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN || "";
  const repo = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!repo) throw new Error("GITHUB_REPOSITORY is required.");

  const outputDir = path.resolve(options.outputDir);
  const cacheDir = path.resolve(options.cacheDir);
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.mkdir(cacheDir, { recursive: true });

  const apiUrl = `https://api.github.com/repos/${repo}/releases/${options.releaseId}`;
  const release = await requestJson(apiUrl, token);
  const assets = Array.isArray(release && release.assets) ? release.assets : [];

  const patchBase = path.basename(options.patchFile, path.extname(options.patchFile));
  const apkAssets = assets.filter((asset) => {
    const name = String(asset && asset.name ? asset.name : "");
    return name.toLowerCase().endsWith(".apk") && name.includes(`-${patchBase}.apk`);
  });
  if (apkAssets.length === 0) {
    throw new Error(`[${options.channel}] No reusable APK assets found in release ${options.releaseId} for patch ${options.patchFile}`);
  }

  const apps = [];
  for (const asset of apkAssets) {
    const assetName = String(asset.name || "");
    const assetUrl = String(asset.browser_download_url || "");
    if (!assetName || !assetUrl) continue;

    const cachePath = path.join(cacheDir, assetName);
    const outPath = path.join(outputDir, assetName);

    if (!(await fileExists(cachePath))) {
      console.log(`[${options.channel}] Download release asset -> ${cachePath}`);
      await downloadToFile(assetUrl, cachePath, token);
    } else {
      console.log(`[${options.channel}] Use cached release asset -> ${cachePath}`);
    }

    await fsp.copyFile(cachePath, outPath);
    const parsed = parseAppFromPatchedName(assetName, patchBase);
    if (parsed) {
      apps.push({
        appName: parsed.appName,
        apkVersion: parsed.apkVersion,
        patchFileName: options.patchFile,
        outputApkPath: outPath,
        channel: options.channel,
      });
    }
  }

  if (apps.length === 0) {
    throw new Error(`[${options.channel}] Reused assets found but cannot parse app/version from filenames.`);
  }

  const metadata = {
    channel: options.channel,
    generatedAt: new Date().toISOString(),
    configPath: "",
    patchCli: {
      fileName: options.cliFile,
    },
    patchFiles: [options.patchFile],
    apps,
  };
  const metadataPath = path.join(outputDir, `release-metadata-${options.channel}.json`);
  await fsp.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(metadataPath);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

