/**
 * APKPure provider resolver.
 * Keep source-specific parsing logic isolated for easier maintenance.
 */
"use strict";

const { URL } = require("url");

function isApkPureHost(urlValue) {
  try {
    const host = new URL(String(urlValue)).host.toLowerCase();
    return host.includes("apkpure.com");
  } catch {
    return false;
  }
}

function normalizeVersion(version) {
  return String(version || "").trim();
}

function versionAppearsInText(text, targetVersion) {
  if (!targetVersion) {
    return true;
  }
  const value = String(text || "").toLowerCase();
  const normalized = normalizeVersion(targetVersion).toLowerCase();
  const dashed = normalized.replace(/\./gu, "-");
  return value.includes(normalized) || value.includes(dashed);
}

function extractVersionFromApkPurePage(html) {
  const matchers = [
    /itemprop="softwareVersion"[^>]*content="([^"]+)"/iu,
    /"version"\s*:\s*"([^"]+)"/iu,
    /"versionName"\s*:\s*"([^"]+)"/iu,
    /<span[^>]*class="[^"]*ver[^"]*"[^>]*>\s*([^<]+)\s*<\/span>/iu,
  ];
  for (const regex of matchers) {
    const match = String(html || "").match(regex);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }
  return null;
}

function extractDirectCandidates(html, ctx, baseUrl) {
  const candidates = [];
  const patterns = [
    'href="([^"]*(?:https?:\\/\\/)?d\\.apkpure\\.com\\/[^"]+)"',
    'href="([^"]*(?:https?:\\/\\/)?download\\.apkpure\\.com\\/[^"]+)"',
    'href="([^"]*(?:https?:\\/\\/)?apkpure\\.com\\/[^"]*\\/download\\?[^"]+)"',
    'data-dt-url="([^"]+)"',
    '"downloadUrl"\\s*:\\s*"([^"]+)"',
    '"url"\\s*:\\s*"(https?:\\\\/\\\\/d\\\\.apkpure\\\\.com[^"]+)"',
  ];

  for (const pattern of patterns) {
    for (const hit of ctx.getHrefMatches(html, pattern)) {
      const decoded = String(hit)
        .replace(/\\\//gu, "/")
        .replace(/&amp;/gu, "&")
        .trim();
      if (!decoded) continue;
      candidates.push(ctx.toAbsoluteUrl(baseUrl, decoded));
    }
  }

  const unique = [];
  const seen = new Set();
  for (const value of candidates) {
    const key = String(value).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

function buildDownloadPageCandidates(app, targetVersion, ctx) {
  const input =
    ctx.pickFirstValue(app, [
    "app_url",
    "app-url",
    "apkpure_dlurl",
    "apkpure-dlurl",
    "release_url",
    "release-url",
    ]);
  if (!input) return [];

  const source = String(input).trim().replace(/\/+$/u, "");
  const hasDownloadSuffix = /\/download(?:\/|$)/iu.test(source);
  const candidates = [];

  if (hasDownloadSuffix) {
    if (targetVersion) {
      const withVersion = source.replace(/\/download(?:\/.*)?$/iu, `/download/${targetVersion}`);
      candidates.push(withVersion);
    }
    candidates.push(source);
  } else {
    if (targetVersion) {
      candidates.push(`${source}/download/${targetVersion}`);
    }
    candidates.push(`${source}/download`);
  }

  const unique = [];
  const seen = new Set();
  for (const value of candidates) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

async function resolveApkPureDownloadUrl(app, appName, opts, ctx) {
  const targetVersion = opts && opts.targetVersion ? normalizeVersion(opts.targetVersion) : null;
  const strictVersion = !!(opts && opts.strictVersion);

  const directDlurl = ctx.pickFirstValue(app, ["download_url", "download-url", "direct_dlurl", "direct-dlurl"]);
  if (directDlurl) {
    if (strictVersion && targetVersion && !versionAppearsInText(directDlurl, targetVersion)) {
      throw new Error(
        `[${appName}] direct download URL does not include target version ${targetVersion}.`,
      );
    }
    return { downloadUrl: directDlurl, resolvedVersion: targetVersion || null };
  }

  const appWithSectionName = { ...app, __section_name: appName };
  const pageCandidates = buildDownloadPageCandidates(appWithSectionName, targetVersion, ctx);
  if (pageCandidates.length === 0) {
    throw new Error(
      `[${appName}] missing app_url/app-url or apkpure-dlurl. ` +
        "Alternatively set direct download_url.",
    );
  }

  const attemptErrors = [];

  for (const pageUrl of pageCandidates) {
    if (!isApkPureHost(pageUrl)) {
      attemptErrors.push(`${pageUrl} -> not an apkpure host URL`);
      continue;
    }

    try {
      ctx.logInfo(`Request: ${pageUrl}`);
      const pageHtml = (await ctx.runCurl(pageUrl)).stdout.toString("utf8");
      const pageVersion = extractVersionFromApkPurePage(pageHtml);

      if (strictVersion && targetVersion) {
        const versionMatchByPage = pageVersion ? pageVersion === targetVersion : false;
        const versionMatchByUrl = versionAppearsInText(pageUrl, targetVersion);
        if (!versionMatchByPage && !versionMatchByUrl) {
          throw new Error(`apkpure page version mismatch (page=${pageVersion || "unknown"}, target=${targetVersion})`);
        }
      }

      const directCandidates = extractDirectCandidates(pageHtml, ctx, pageUrl);
      if (directCandidates.length === 0) {
        throw new Error("download page has no direct candidate link");
      }

      const prioritized = [];
      if (targetVersion) {
        for (const value of directCandidates) {
          if (versionAppearsInText(value, targetVersion)) {
            prioritized.push(value);
          }
        }
      }
      for (const value of directCandidates) {
        if (!prioritized.includes(value)) {
          prioritized.push(value);
        }
      }

      if (strictVersion && targetVersion && prioritized.length > 0) {
        const strictHits = prioritized.filter((value) => versionAppearsInText(value, targetVersion));
        if (strictHits.length > 0) {
          return { downloadUrl: strictHits[0], resolvedVersion: targetVersion };
        }
      }

      const selected = prioritized[0];
      return {
        downloadUrl: selected,
        resolvedVersion: targetVersion || pageVersion || null,
      };
    } catch (err) {
      attemptErrors.push(`${pageUrl} -> ${err.message || String(err)}`);
    }
  }

  if (strictVersion && targetVersion) {
    throw new Error(
      `[${appName}] unable to find downloadable apkpure build for target version ${targetVersion}.\n` +
        attemptErrors.join("\n"),
    );
  }
  throw new Error(
    `[${appName}] unable to resolve final apkpure download URL. Try setting download_url directly.\n` +
      attemptErrors.join("\n"),
  );
}

module.exports = {
  resolveApkPureDownloadUrl,
};
