#!/usr/bin/env node
"use strict";

const https = require("https");
const fsp = require("fs").promises;

const DEFAULT_PATCH_CLI_REPO = "MorpheApp/morphe-cli";
const DEFAULT_PATCHES_REPO = "MorpheApp/morphe-patches";
const RELEASE_SOURCE_ANY = "any";
const RELEASE_SOURCE_MANUAL = "manual";
const RELEASE_SOURCE_SCHEDULED = "scheduled";

function parseArgs(argv) {
  const options = {
    channel: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--channel") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --channel");
      }
      options.channel = String(value).trim().toLowerCase();
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.channel || !["stable", "dev"].includes(options.channel)) {
    throw new Error("Invalid --channel. Allowed: stable, dev.");
  }
  return options;
}

function isDevIdentifier(text) {
  return String(text || "").toLowerCase().includes("dev");
}

function requestJson(url, token) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "morphe-ci-channel-check",
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

async function fetchReleases(repo, token) {
  if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo)) {
    throw new Error(`Invalid repo format: ${repo}`);
  }
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const payload = await requestJson(url, token);
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected releases response for ${repo}`);
  }
  return payload;
}

function pickLatestCliJarFileName(releases) {
  for (const release of releases) {
    if (!release || release.draft) continue;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const jarAssets = assets.filter((asset) => String(asset && asset.name ? asset.name : "").toLowerCase().endsWith(".jar"));
    if (jarAssets.length === 0) continue;
    const preferred =
      jarAssets.find((asset) => String(asset.name).toLowerCase().endsWith("-all.jar")) ||
      jarAssets[0];
    return String(preferred.name);
  }
  return null;
}

function pickLatestPatchFileName(releases, channel) {
  for (const release of releases) {
    if (!release || release.draft) continue;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const mppAssets = assets.filter((asset) => String(asset && asset.name ? asset.name : "").toLowerCase().endsWith(".mpp"));
    if (mppAssets.length === 0) continue;

    const releaseText = `${release.tag_name || ""} ${release.name || ""}`;
    const matched = mppAssets.filter((asset) => {
      const text = `${releaseText} ${String(asset.name || "")}`;
      const isDev = isDevIdentifier(text);
      return channel === "dev" ? isDev : !isDev;
    });
    if (matched.length === 0) continue;

    const preferred =
      matched.find((asset) => String(asset.name).toLowerCase().startsWith("patches-")) ||
      matched[0];
    return String(preferred.name);
  }
  return null;
}

function releaseBodyContainsAll(release, requiredTokens) {
  const body = String(release && release.body ? release.body : "");
  return requiredTokens.every((token) => body.includes(token));
}

function normalizeReleaseSourceScope(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === RELEASE_SOURCE_MANUAL || raw === RELEASE_SOURCE_SCHEDULED) return raw;
  return RELEASE_SOURCE_ANY;
}

function releaseMatchesSourceScope(release, scope) {
  if (scope === RELEASE_SOURCE_ANY) return true;
  const body = String(release && release.body ? release.body : "").toLowerCase();
  return body.includes(`workflow_source: ${scope}`);
}

async function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  await fsp.appendFile(outputPath, `${name}=${value}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const force = String(process.env.INPUT_FORCE || "").toLowerCase() === "true";

  const token = process.env.GITHUB_TOKEN || "";
  const currentRepo = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!currentRepo) {
    throw new Error("GITHUB_REPOSITORY is required.");
  }

  const cliRepo = String(process.env.PATCH_CLI_REPO || DEFAULT_PATCH_CLI_REPO).trim();
  const patchesRepo = String(process.env.PATCHES_REPO || DEFAULT_PATCHES_REPO).trim();
  const releaseSourceScope = normalizeReleaseSourceScope(process.env.RELEASE_SOURCE_SCOPE);

  const [cliReleases, patchReleases, currentReleases] = await Promise.all([
    fetchReleases(cliRepo, token),
    fetchReleases(patchesRepo, token),
    fetchReleases(currentRepo, token),
  ]);

  const cliFile = pickLatestCliJarFileName(cliReleases);
  const patchFile = pickLatestPatchFileName(patchReleases, options.channel);
  if (!cliFile || !patchFile) {
    throw new Error(`Cannot resolve latest files for channel=${options.channel}. cli=${cliFile || "none"}, patch=${patchFile || "none"}`);
  }

  const required = [cliFile, patchFile];
  const matchedRelease = currentReleases.find((release) => {
    if (!release || release.draft) return false;
    if (!releaseMatchesSourceScope(release, releaseSourceScope)) return false;
    return releaseBodyContainsAll(release, required);
  });

  let shouldBuild = true;
  if (!force && matchedRelease) {
    shouldBuild = false;
  }

  console.log(
    `[${options.channel}] cli=${cliFile}, patch=${patchFile}, source_scope=${releaseSourceScope}, should_build=${shouldBuild ? "true" : "false"}`,
  );

  await setOutput("channel", options.channel);
  await setOutput("cli_file", cliFile);
  await setOutput("patch_file", patchFile);
  await setOutput("should_build", shouldBuild ? "true" : "false");
  await setOutput("matched_release_id", matchedRelease ? String(matchedRelease.id || "") : "");
  await setOutput("matched_release_name", matchedRelease ? String(matchedRelease.name || matchedRelease.tag_name || "") : "");
}

main().catch(async (err) => {
  console.error(err && err.message ? err.message : String(err));
  try {
    await setOutput("should_build", "true");
    await setOutput("matched_release_id", "");
    await setOutput("matched_release_name", "");
  } catch {
    // ignore
  }
  process.exit(1);
});
