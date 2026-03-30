/**
 * archive.org APK directory provider resolver.
 */
"use strict";

const { URL } = require("url");
const { getProviderUrl } = require("./url-map");

function normalizeVersion(version) {
  return String(version || "").trim();
}

function isArchiveHost(urlValue) {
  try {
    const host = new URL(String(urlValue)).host.toLowerCase();
    return host.includes("archive.org");
  } catch {
    return false;
  }
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

function tokenizeVersion(versionText) {
  return String(versionText || "")
    .toLowerCase()
    .split(/[.\-]/u)
    .filter(Boolean)
    .map((part) => (/^\d+$/u.test(part) ? Number.parseInt(part, 10) : part));
}

function compareVersionPart(a, b) {
  const aNum = typeof a === "number";
  const bNum = typeof b === "number";
  if (aNum && bNum) {
    return a === b ? 0 : (a > b ? 1 : -1);
  }
  if (aNum && !bNum) return 1;
  if (!aNum && bNum) return -1;
  const aText = String(a || "");
  const bText = String(b || "");
  if (aText === bText) return 0;
  return aText > bText ? 1 : -1;
}

function compareVersionText(a, b) {
  const pa = tokenizeVersion(a);
  const pb = tokenizeVersion(b);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = pa[i];
    const bv = pb[i];
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    const cmp = compareVersionPart(av, bv);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function extractVersionFromFileName(fileName) {
  const value = String(fileName || "");
  const patterns = [
    /-([0-9]+(?:\.[0-9A-Za-z-]+)+)-[^/]*\.apk$/iu,
    /-([0-9]+(?:\.[0-9A-Za-z-]+)+)\.apk$/iu,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

function extractArchiveEntries(html, baseUrl, ctx) {
  const hrefMatches = ctx.getHrefMatches(html, 'href="([^"]+\\.apk)"');
  const entries = [];
  const seen = new Set();

  for (const href of hrefMatches) {
    const raw = String(href || "").trim();
    if (!raw || raw === "../") {
      continue;
    }
    const abs = ctx.toAbsoluteUrl(baseUrl, raw.replace(/&amp;/gu, "&"));
    if (!isArchiveHost(abs) || seen.has(abs)) {
      continue;
    }
    seen.add(abs);
    entries.push({
      url: abs,
      fileName: raw.split("/").pop() || raw,
      version: extractVersionFromFileName(raw),
    });
  }

  return entries;
}

function pickLatestEntry(entries) {
  const withVersion = entries.filter((entry) => entry && entry.version);
  if (withVersion.length === 0) {
    return entries[0] || null;
  }
  withVersion.sort((a, b) => compareVersionText(b.version, a.version));
  return withVersion[0];
}

async function resolveArchiveDownloadUrl(app, appName, opts, ctx) {
  const targetVersion = opts && opts.targetVersion ? normalizeVersion(opts.targetVersion) : null;
  const strictVersion = !!(opts && opts.strictVersion);

  const directDlurl = ctx.pickFirstValue(app, ["download_url", "download-url", "direct_dlurl", "direct-dlurl"]);
  if (directDlurl) {
    if (strictVersion && targetVersion && !versionAppearsInText(directDlurl, targetVersion)) {
      throw new Error(`[${appName}] direct download URL does not include target version ${targetVersion}.`);
    }
    return { downloadUrl: directDlurl, resolvedVersion: targetVersion || null };
  }

  const appWithSectionName = { ...app, __section_name: appName };
  const baseUrl =
    ctx.pickFirstValue(appWithSectionName, [
      "archive_url",
      "archive-url",
      "archive_dlurl",
      "archive-dlurl",
      "app_url",
      "app-url",
    ]) || getProviderUrl(appName, "archive");

  if (!baseUrl) {
    throw new Error(
      `[${appName}] missing archive_url/archive-url. ` +
        "Alternatively set direct download_url.",
    );
  }
  if (!isArchiveHost(baseUrl)) {
    throw new Error(`[${appName}] archive URL must be archive.org host. Got: ${baseUrl}`);
  }

  const normalizedBase = String(baseUrl).endsWith("/") ? String(baseUrl) : `${String(baseUrl)}/`;
  ctx.logInfo(`Request: ${normalizedBase}`);
  const html = (await ctx.runCurl(normalizedBase)).stdout.toString("utf8");
  const entries = extractArchiveEntries(html, normalizedBase, ctx);
  if (entries.length === 0) {
    throw new Error(`[${appName}] archive page has no APK entries.`);
  }

  if (targetVersion) {
    const strictHits = entries.filter((entry) =>
      versionAppearsInText(`${entry.version || ""} ${entry.fileName} ${entry.url}`, targetVersion),
    );
    if (strictVersion && strictHits.length === 0) {
      throw new Error(`[${appName}] archive does not contain target version ${targetVersion}.`);
    }
    if (strictHits.length > 0) {
      const picked = strictHits[0];
      return { downloadUrl: picked.url, resolvedVersion: targetVersion || picked.version || null };
    }

    const urls = entries.map((entry) => entry.url);
    const bestUrl = ctx.selectBestByVersion(urls, targetVersion);
    if (bestUrl) {
      const picked = entries.find((entry) => entry.url === bestUrl) || entries[0];
      return { downloadUrl: picked.url, resolvedVersion: picked.version || targetVersion || null };
    }
  }

  const latest = pickLatestEntry(entries);
  if (!latest) {
    throw new Error(`[${appName}] unable to choose latest archive APK entry.`);
  }
  return {
    downloadUrl: latest.url,
    resolvedVersion: latest.version || null,
  };
}

module.exports = {
  resolveArchiveDownloadUrl,
};

