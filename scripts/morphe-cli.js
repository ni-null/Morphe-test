"use strict";

const path = require("path");

const DEFAULT_MORPHE_CLI_REPO = "MorpheApp/morphe-cli";
const DEFAULT_MORPHE_CLI_DIR_REL = "./morphe-cli";

function pickJarAssetFromRelease(release, ctx) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const jarAssets = assets.filter(
    (asset) =>
      ctx.hasValue(asset && asset.name) &&
      ctx.hasValue(asset && asset.browser_download_url) &&
      String(asset.name).toLowerCase().endsWith(".jar"),
  );
  if (jarAssets.length === 0) {
    return null;
  }

  const preferred =
    jarAssets.find((asset) => String(asset.name).toLowerCase().endsWith("-all.jar")) ||
    jarAssets.find((asset) => String(asset.name).toLowerCase().includes("all")) ||
    jarAssets[0];

  return {
    tag: ctx.hasValue(release.tag_name) ? String(release.tag_name) : "unknown",
    name: String(preferred.name),
    url: String(preferred.browser_download_url),
  };
}

async function fetchRepoReleases(repo, ctx) {
  const repoValue = ctx.hasValue(repo) ? String(repo).trim() : DEFAULT_MORPHE_CLI_REPO;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repoValue)) {
    throw new Error(`Invalid morphe-cli repo format: ${repoValue}. Expected owner/repo.`);
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

function pickLatestMorpheCliJar(releases, ctx) {
  for (const release of releases) {
    if (release && release.draft) {
      continue;
    }
    const picked = pickJarAssetFromRelease(release, ctx);
    if (picked) {
      return picked;
    }
  }
  return null;
}

function findJarAssetByExactName(releases, expectedName, ctx) {
  const normalizedExpected = String(expectedName || "").trim();
  if (!normalizedExpected) {
    return null;
  }
  for (const release of releases) {
    if (release && release.draft) {
      continue;
    }
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const asset of assets) {
      if (
        ctx.hasValue(asset && asset.name) &&
        ctx.hasValue(asset && asset.browser_download_url) &&
        String(asset.name) === normalizedExpected &&
        String(asset.name).toLowerCase().endsWith(".jar")
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

async function resolveMorpheCliJar(params) {
  const { configDir, morpheCliCfg, dryRun, force, ctx } = params;
  const repo =
    ctx.pickFirstValue(morpheCliCfg || {}, ["patches_repo", "patches-repo", "repo"]) ||
    DEFAULT_MORPHE_CLI_REPO;
  const lockedVersionName =
    ctx.pickFirstValue(morpheCliCfg || {}, ["ver", "version", "jar_ver", "jar-ver"]) || null;

  const saveDir = ctx.resolveAbsolutePath(DEFAULT_MORPHE_CLI_DIR_REL, configDir);
  if (lockedVersionName) {
    const lockedFileName = path.basename(String(lockedVersionName).trim());
    const lockedPath = path.join(saveDir, lockedFileName);
    const exists = await ctx.fileExists(lockedPath);
    if (exists && !force) {
      ctx.logInfo(`morphe-cli locked version already exists, skip download: ${lockedPath}`);
      return lockedPath;
    }
    if (dryRun) {
      if (exists && force) {
        ctx.logInfo(`DryRun: would redownload locked morphe-cli jar ${lockedFileName} (force enabled)`);
      } else {
        ctx.logInfo(`DryRun: would download locked morphe-cli jar ${lockedFileName}`);
      }
      ctx.logInfo(`DryRun: would save morphe-cli jar to ${lockedPath}`);
      return lockedPath;
    }

    const fetched = await fetchRepoReleases(repo, ctx);
    const matched = findJarAssetByExactName(fetched.releases, lockedFileName, ctx);
    if (!matched) {
      throw new Error(`Locked morphe-cli jar not found in ${fetched.repo}: ${lockedFileName}`);
    }

    ctx.logInfo(`Locked morphe-cli: ${matched.name} (${matched.tag}) from ${fetched.repo}`);
    await ctx.downloadFile(matched.url, lockedPath, "morphe-cli jar");
    return lockedPath;
  }

  if (dryRun) {
    ctx.logInfo(`DryRun: would fetch latest morphe-cli jar from ${repo}`);
    ctx.logInfo(`DryRun: save path keeps original release filename under ${saveDir}`);
    return ctx.resolveAbsolutePath(path.join(DEFAULT_MORPHE_CLI_DIR_REL, "morphe-cli-latest-all.jar"), configDir);
  }

  const fetched = await fetchRepoReleases(repo, ctx);
  const latestJar = pickLatestMorpheCliJar(fetched.releases, ctx);
  if (!latestJar) {
    throw new Error(`No .jar asset found in releases for ${fetched.repo}.`);
  }

  const jarPath = path.join(saveDir, latestJar.name);
  const exists = await ctx.fileExists(jarPath);
  if (exists && !force) {
    ctx.logInfo(`morphe-cli jar already exists, skip download: ${jarPath}`);
    return jarPath;
  }

  ctx.logInfo(`Auto morphe-cli: ${latestJar.name} (${latestJar.tag}) from ${fetched.repo}`);
  await ctx.downloadFile(latestJar.url, jarPath, "morphe-cli jar");
  return jarPath;
}

module.exports = {
  resolveMorpheCliJar,
};
