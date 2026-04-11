#!/usr/bin/env node
"use strict";

const https = require("https");
const fsp = require("fs").promises;

function parseArgs(argv) {
  const options = {
    repo: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --repo");
      }
      options.repo = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "patcher-ci-microg",
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
          reject(new Error(`Invalid JSON from GitHub: ${err.message}`));
        }
      });
    });
    req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
  });
}

function pickMicrogAsset(releases) {
  if (!Array.isArray(releases)) return null;
  const candidates = releases.filter((release) => release && !release.draft);
  const stablePreferred = candidates.find((release) => !release.prerelease);
  const ordered = stablePreferred ? [stablePreferred, ...candidates.filter((r) => r !== stablePreferred)] : candidates;

  for (const release of ordered) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const apkAssets = assets.filter((asset) => {
      const name = String(asset && asset.name ? asset.name : "");
      return name.toLowerCase().endsWith(".apk");
    });
    if (apkAssets.length === 0) {
      continue;
    }
    const preferred =
      apkAssets.find((asset) => /^microg-.*\.apk$/iu.test(String(asset.name || ""))) ||
      apkAssets[0];
    return {
      tag: String(release.tag_name || ""),
      name: String(preferred.name || ""),
      url: String(preferred.browser_download_url || ""),
    };
  }

  return null;
}

async function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await fsp.appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!String(options.repo || "").trim()) {
    throw new Error("--repo is required.");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(String(options.repo || ""))) {
    throw new Error(`Invalid repo format: ${options.repo}`);
  }

  const token = process.env.GITHUB_TOKEN || "";
  const apiUrl = `https://api.github.com/repos/${options.repo}/releases?per_page=50`;
  const releases = await requestJson(apiUrl, token);
  const asset = pickMicrogAsset(releases);
  if (!asset || !asset.name || !asset.url) {
    throw new Error(`No MicroG APK asset found in ${options.repo} releases.`);
  }

  console.log(`MicroG asset: ${asset.name} (${asset.tag})`);
  await setOutput("asset_name", asset.name);
  await setOutput("asset_url", asset.url);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});

