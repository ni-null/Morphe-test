"use strict";

const path = require("path");
const { URL } = require("url");

function normalizePatchMode(rawMode) {
  const value = String(rawMode || "stable").trim().toLowerCase();
  if (value === "stable" || value === "dev") {
    return value;
  }
  throw new Error(`Invalid patches.mode: ${rawMode}. Allowed values: stable, dev.`);
}

function isDevIdentifier(text) {
  return String(text || "").toLowerCase().includes("dev");
}

function pickMppAssetFromRelease(release, mode, ctx) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const mppAssets = assets.filter(
    (asset) =>
      ctx.hasValue(asset && asset.name) &&
      ctx.hasValue(asset && asset.browser_download_url) &&
      String(asset.name).toLowerCase().endsWith(".mpp"),
  );
  if (mppAssets.length === 0) {
    return null;
  }

  const releaseIdText = `${release.tag_name || ""} ${release.name || ""}`;
  const matchedByMode = mppAssets.filter((asset) => {
    const text = `${releaseIdText} ${asset.name || ""}`;
    const isDev = isDevIdentifier(text);
    return mode === "dev" ? isDev : !isDev;
  });
  if (matchedByMode.length === 0) {
    return null;
  }

  const preferred =
    matchedByMode.find((asset) => String(asset.name).toLowerCase().startsWith("patches-")) ||
    matchedByMode[0];

  return {
    repo: null,
    tag: ctx.hasValue(release.tag_name) ? String(release.tag_name) : "unknown",
    name: String(preferred.name),
    url: String(preferred.browser_download_url),
  };
}

async function fetchRepoReleases(repo, ctx) {
  const repoValue = ctx.hasValue(repo) ? String(repo).trim() : ctx.defaultPatchesRepo;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repoValue)) {
    throw new Error(`Invalid patches repo format: ${repoValue}. Expected owner/repo.`);
  }

  const apiUrl = `https://api.github.com/repos/${repoValue}/releases?per_page=50`;
  ctx.logInfo(`Request: ${apiUrl}`);
  const payload = (await ctx.runCurl(apiUrl)).stdout.toString("utf8");

  let releases = null;
  try {
    releases = JSON.parse(payload);
  } catch {
    throw new Error(`Failed to parse GitHub releases response for ${repoValue}.`);
  }
  if (!Array.isArray(releases) || releases.length === 0) {
    throw new Error(`No releases found for ${repoValue}.`);
  }

  return { repo: repoValue, releases };
}

async function getLatestMorphePatchAsset(repo, mode, ctx) {
  const resolvedMode = normalizePatchMode(mode);
  const fetched = await fetchRepoReleases(repo, ctx);
  const { repo: repoValue, releases } = fetched;

  for (const release of releases) {
    const asset = pickMppAssetFromRelease(release, resolvedMode, ctx);
    if (!asset) {
      continue;
    }
    return {
      repo: repoValue,
      tag: asset.tag,
      name: asset.name,
      url: asset.url,
      mode: resolvedMode,
    };
  }

  throw new Error(`No .mpp asset found for mode=${resolvedMode} in repo ${repoValue}.`);
}

function findAssetByExactName(releases, expectedName, ctx) {
  const normalizedExpected = String(expectedName).trim();
  if (!normalizedExpected) {
    return null;
  }

  for (const release of releases) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const asset of assets) {
      if (
        ctx.hasValue(asset && asset.name) &&
        ctx.hasValue(asset && asset.browser_download_url) &&
        String(asset.name) === normalizedExpected
      ) {
        return {
          tag: ctx.hasValue(release.tag_name) ? String(release.tag_name) : "unknown",
          name: String(asset.name),
          url: String(asset.browser_download_url),
        };
      }
    }
  }

  return null;
}

async function resolvePatchFile(params) {
  const {
    app,
    appName,
    configDir,
    globalCfg,
    patchesCfg,
    dryRun,
    force,
    ctx,
  } = params;

  const repoName =
    ctx.pickFirstValue(app, ["patches_repo", "patches-repo"]) ||
    ctx.pickFirstValue(patchesCfg || {}, ["patches_repo", "patches-repo"]) ||
    ctx.pickFirstValue(globalCfg || {}, ["patches_repo", "patches-repo"]) ||
    ctx.defaultPatchesRepo;
  const mode =
    ctx.pickFirstValue(app, ["patches_mode", "patches-mode"]) ||
    ctx.pickFirstValue(patchesCfg || {}, ["mode"]) ||
    "stable";
  const lockedVersionName =
    ctx.pickFirstValue(app, ["patches_ver", "patches-ver"]) ||
    ctx.pickFirstValue(patchesCfg || {}, ["ver"]) ||
    null;

  if (lockedVersionName) {
    const lockedFileName = path.basename(String(lockedVersionName).trim());
    const lockedPath = ctx.resolveAbsolutePath(path.join("patches", lockedFileName), configDir);
    const lockedExists = await ctx.fileExists(lockedPath);

    if (lockedExists && !force) {
      ctx.logInfo(`[${appName}] Using locked patch version (already exists): ${lockedPath}`);
      return lockedPath;
    }

    if (dryRun) {
      if (lockedExists && force) {
        ctx.logInfo(`DryRun: would redownload locked patch version ${lockedFileName} (force enabled)`);
      } else {
        ctx.logInfo(`DryRun: would download locked patch version ${lockedFileName}`);
      }
      ctx.logInfo(`DryRun: would save patch file to ${lockedPath}`);
      return lockedPath;
    }

    const fetched = await fetchRepoReleases(repoName, ctx);
    const matched = findAssetByExactName(fetched.releases, lockedFileName, ctx);
    if (!matched) {
      throw new Error(
        `[${appName}] Locked patch version not found in ${repoName}: ${lockedFileName}`,
      );
    }

    await ctx.downloadFile(matched.url, lockedPath, "patch file");
    return lockedPath;
  }

  if (dryRun) {
    ctx.logInfo(`DryRun: would fetch latest patch bundle from ${repoName} with mode=${mode}`);
    ctx.logInfo("DryRun: save path will keep original release asset filename under ./patches");
    return ctx.resolveAbsolutePath(path.join("patches", `${ctx.safeFileName(appName)}.mpp`), configDir);
  }

  const latest = await getLatestMorphePatchAsset(repoName, mode, ctx);
  const latestPath = ctx.resolveAbsolutePath(path.join("patches", latest.name), configDir);
  const exists = await ctx.fileExists(latestPath);
  if (exists && !force) {
    ctx.logInfo(`[${appName}] Latest patch already exists: ${latestPath}`);
    return latestPath;
  }

  ctx.logInfo(
    `Auto patch bundle: ${latest.name} (${latest.tag}) mode=${latest.mode} from ${latest.repo}`,
  );
  await ctx.downloadFile(latest.url, latestPath, "patch file");
  return latestPath;
}

function normalizeVersionPart(value) {
  return String(value || "").trim();
}

function splitVersionParts(version) {
  return normalizeVersionPart(version)
    .split(/[._+-]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/^\d+$/u.test(part) ? Number.parseInt(part, 10) : part.toLowerCase()));
}

function compareVersionsDesc(a, b) {
  const aParts = splitVersionParts(a);
  const bParts = splitVersionParts(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const aValue = i < aParts.length ? aParts[i] : 0;
    const bValue = i < bParts.length ? bParts[i] : 0;

    if (typeof aValue === "number" && typeof bValue === "number") {
      if (aValue > bValue) return -1;
      if (aValue < bValue) return 1;
      continue;
    }
    if (typeof aValue === "number" && typeof bValue !== "number") return -1;
    if (typeof aValue !== "number" && typeof bValue === "number") return 1;

    if (String(aValue) > String(bValue)) return -1;
    if (String(aValue) < String(bValue)) return 1;
  }
  return 0;
}

function dedupeAndSortVersions(versions) {
  const unique = Array.from(
    new Set(
      versions
        .map((value) => normalizeVersionPart(value))
        .filter((value) => value.length > 0),
    ),
  );
  unique.sort(compareVersionsDesc);
  return unique;
}

function parseListPatchesCompatibility(rawText) {
  const packageVersions = new Map();
  const UNKNOWN_PACKAGE = "__unknown__";
  const lines = String(rawText || "").split(/\r?\n/u);
  let currentPackage = null;
  let inVersions = false;

  function ensureVersionSet(packageName) {
    const key = packageName || UNKNOWN_PACKAGE;
    if (!packageVersions.has(key)) {
      packageVersions.set(key, new Set());
    }
    return packageVersions.get(key);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const packageMatch = line.match(/^Package name:\s*(.+)$/iu);
    if (packageMatch) {
      currentPackage = packageMatch[1].trim();
      ensureVersionSet(currentPackage);
      inVersions = false;
      continue;
    }
    if (/^(Compatible versions|Versions)\s*:\s*$/iu.test(line)) {
      ensureVersionSet(currentPackage);
      inVersions = true;
      continue;
    }
    if (!inVersions) {
      continue;
    }
    if (!line) {
      inVersions = false;
      continue;
    }
    if (/^(Index|Name|Description|Enabled|Compatible packages|Package name)\s*:/iu.test(line)) {
      inVersions = false;
      continue;
    }

    const candidate = line.replace(/^[-*]\s*/u, "").trim();
    if (!candidate) {
      continue;
    }
    if (/^any$/iu.test(candidate)) {
      ensureVersionSet(currentPackage).add("Any");
      continue;
    }
    const versionMatch = candidate.match(/([0-9]+(?:\.[0-9A-Za-z-]+)+)/u);
    if (versionMatch) {
      ensureVersionSet(currentPackage).add(versionMatch[1]);
    }
  }

  return packageVersions;
}

function getConfiguredPackageName(app, appName, ctx) {
  const configured = ctx.pickFirstValue(app, [
    "package_name",
    "package-name",
    "package",
    "pkg_name",
    "pkg-name",
    "application_id",
    "application-id",
    "app_id",
    "app-id",
  ]);
  if (configured) return configured.trim();
  if (appName.includes(".")) return appName;
  return null;
}

function inferPackageNameFromList(appName, packageVersions) {
  const packageNames = Array.from(packageVersions.keys()).filter((name) => name !== "__unknown__");
  if (packageNames.length === 0) return null;
  if (packageNames.length === 1) return packageNames[0];

  const appNameLower = String(appName).toLowerCase();
  const exact = packageNames.find((name) => name.toLowerCase() === appNameLower);
  if (exact) return exact;

  const suffixMatches = packageNames.filter((name) => name.toLowerCase().endsWith(`.${appNameLower}`));
  if (suffixMatches.length === 1) return suffixMatches[0];
  return null;
}

async function listPatchesRawOutput(jarPath, patchPath, packageName, ctx) {
  const commands = [];
  if (packageName) {
    commands.push([
      "-jar",
      jarPath,
      "list-patches",
      "--patches",
      patchPath,
      "-f",
      packageName,
      "--with-versions",
      "--with-packages",
    ]);
    commands.push([
      "-jar",
      jarPath,
      "list-patches",
      "-p",
      patchPath,
      "--filter-package-name",
      packageName,
      "--versions",
      "--packages",
      "-b",
    ]);
  } else {
    commands.push(["-jar", jarPath, "list-patches", "--patches", patchPath, "--with-versions", "--with-packages"]);
    commands.push(["-jar", jarPath, "list-patches", "-p", patchPath, "--versions", "--packages", "-b"]);
  }

  let lastError = "unknown error";
  for (const args of commands) {
    const result = await ctx.runCommandCapture("java", args);
    const combined = `${result.stdout}\n${result.stderr}`.trim();
    if (result.code === 0) {
      return combined;
    }
    lastError = combined || `exit code ${result.code}`;
  }

  throw new Error(`Failed to list patch versions: ${lastError}`);
}

async function resolvePatchCompatibleVersions(jarPath, patchPath, appName, app, ctx) {
  const configuredPackage = getConfiguredPackageName(app, appName, ctx);
  const listOutput = await listPatchesRawOutput(jarPath, patchPath, configuredPackage, ctx);
  const packageVersions = parseListPatchesCompatibility(listOutput);

  let packageName = configuredPackage;
  if (!packageName) {
    packageName = inferPackageNameFromList(appName, packageVersions);
    if (packageName) {
      ctx.logInfo(`[${appName}] Inferred package_name from patches: ${packageName}`);
    }
  }

  if (!packageName) {
    const choices = Array.from(packageVersions.keys()).filter((name) => name !== "__unknown__");
    throw new Error(
      `[${appName}] Cannot infer package name for compatibility lookup. ` +
        `Set package_name in config. Available packages: ${choices.join(", ")}`,
    );
  }

  let versions = [];
  if (packageVersions.has(packageName)) {
    versions = Array.from(packageVersions.get(packageName));
  } else if (packageVersions.has("__unknown__")) {
    versions = Array.from(packageVersions.get("__unknown__"));
  }

  if (versions.length === 0) {
    throw new Error(`[${appName}] No compatible versions found in patch file for package ${packageName}.`);
  }
  if (versions.some((value) => /^any$/iu.test(String(value)))) {
    return { packageName, versions: [], any: true };
  }

  return { packageName, versions: dedupeAndSortVersions(versions), any: false };
}

async function resolveVersionCandidates(params) {
  const { app, appName, jarPath, patchPath, dryRun, ctx } = params;

  if (ctx.hasValue(app.ver)) {
    return [{ version: String(app.ver).trim(), strictVersion: true, source: "config.ver" }];
  }
  if (!patchPath) {
    throw new Error(`[${appName}] ver is empty. Cannot resolve compatible versions without patch file.`);
  }

  if (dryRun && !(await ctx.fileExists(jarPath))) {
    ctx.logWarn(
      `[${appName}] DryRun: morphe-cli jar is not present locally, skip compatibility query. ` +
        "Run once without --dry-run to fetch latest morphe-cli jar.",
    );
    return [{ version: null, strictVersion: false, source: "dry-run-no-jar" }];
  }

  if (dryRun && !(await ctx.fileExists(patchPath))) {
    ctx.logWarn(
      `[${appName}] DryRun: patch file is not present locally, skip compatibility query. ` +
        "Use --force or run once without --dry-run to fetch patches.",
    );
    return [{ version: null, strictVersion: false, source: "dry-run-fallback" }];
  }

  const compatibility = await resolvePatchCompatibleVersions(jarPath, patchPath, appName, app, ctx);
  if (compatibility.any) {
    ctx.logWarn(`[${appName}] Patch compatible versions = Any. Falling back to provider default version.`);
    return [{ version: null, strictVersion: false, source: "patch-any" }];
  }
  if (compatibility.versions.length === 0) {
    throw new Error(`[${appName}] Patch compatibility query returned empty version list.`);
  }

  ctx.logInfo(
    `[${appName}] Compatible versions (${compatibility.packageName}): ${compatibility.versions.join(", ")}`,
  );
  return compatibility.versions.map((version) => ({
    version,
    strictVersion: true,
    source: "patch-compatible",
  }));
}

module.exports = {
  resolvePatchFile,
  resolveVersionCandidates,
};
