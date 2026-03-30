/**
 * ApkMirror provider resolver.
 * Keep source-specific parsing logic isolated for easier maintenance.
 */
"use strict";

const { URL } = require("url");

function looksLikeCloudflareChallenge(html) {
  const lower = String(html || "").toLowerCase();
  return (
    lower.includes("just a moment") ||
    lower.includes("cloudflare") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-platform")
  );
}

function stripHtmlTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function slugifyApkMirrorAppName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .replace(/-+$/u, "");
}

function isApkMirrorHost(urlValue) {
  try {
    const host = new URL(String(urlValue)).host.toLowerCase();
    return host.includes("apkmirror.com");
  } catch {
    return false;
  }
}

function normalizeVersion(version) {
  return String(version || "").trim();
}

function versionMatchesInText(text, targetVersion) {
  if (!targetVersion) {
    return true;
  }
  const value = String(text || "").toLowerCase();
  const version = normalizeVersion(targetVersion).toLowerCase();
  const dashed = version.replace(/\./gu, "-");
  return value.includes(version) || value.includes(dashed);
}

function extractVersionFromApkMirrorUrl(urlValue) {
  const value = String(urlValue || "");
  const releaseMatch = value.match(/-([0-9]+(?:-[0-9A-Za-z]+)+)-release\/?/iu);
  if (!releaseMatch) {
    return null;
  }
  return releaseMatch[1].replace(/-/gu, ".");
}

async function buildApkMirrorReleaseUrlFromBase(baseUrl, appVersion, appName, ctx) {
  const normalizedBase = String(baseUrl).replace(/\/+$/u, "");
  if (!appVersion) {
    throw new Error(`[${appName}] apkmirror release URL build requires target version.`);
  }

  ctx.logInfo(`Request: ${normalizedBase}`);
  const appPageHtml = (await ctx.runCurl(normalizedBase)).stdout.toString("utf8");
  if (looksLikeCloudflareChallenge(appPageHtml)) {
    throw new Error(
      `[${appName}] ApkMirror returned Cloudflare challenge page. ` +
        "Set download_url directly or use uptodown provider.",
    );
  }

  const h1Match =
    appPageHtml.match(/<h1[^>]*class="[^"]*marginZero[^"]*"[^>]*>([\s\S]*?)<\/h1>/iu) ||
    appPageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu);
  if (!h1Match) {
    throw new Error(`[${appName}] cannot find app title from ApkMirror app page.`);
  }

  const appTitle = stripHtmlTags(h1Match[1]);
  const appSlug = slugifyApkMirrorAppName(appTitle);
  if (!appSlug) {
    throw new Error(`[${appName}] failed to derive app slug from ApkMirror title: ${appTitle}`);
  }

  const versionPart = normalizeVersion(appVersion).replace(/\s+/gu, "-").replace(/\./gu, "-");
  return `${normalizedBase}/${appSlug}-${versionPart}-release/`;
}

async function resolveApkMirrorDownloadUrl(app, appName, opts, ctx) {
  const targetVersion = opts && opts.targetVersion ? normalizeVersion(opts.targetVersion) : null;
  const strictVersion = !!(opts && opts.strictVersion);

  const directDlurl = ctx.pickFirstValue(app, ["download_url", "download-url", "direct_dlurl", "direct-dlurl"]);
  if (directDlurl) {
    if (strictVersion && targetVersion && !versionMatchesInText(directDlurl, targetVersion)) {
      throw new Error(
        `[${appName}] direct download URL does not contain target version ${targetVersion}. ` +
          "Use version-specific URL or disable strict mode.",
      );
    }
    return { downloadUrl: directDlurl, resolvedVersion: targetVersion || null };
  }

  let releaseUrl = ctx.pickFirstValue(app, ["release_url", "release-url"]);
  let apkmirrorBaseUrl = ctx.pickFirstValue(app, ["apkmirror_dlurl", "apkmirror-dlurl"]);

  if (releaseUrl && !isApkMirrorHost(releaseUrl)) {
    throw new Error(
      `[${appName}] apk=apkmirror requires release_url on apkmirror host. Got: ${releaseUrl}`,
    );
  }
  if (apkmirrorBaseUrl && !isApkMirrorHost(apkmirrorBaseUrl)) {
    throw new Error(
      `[${appName}] apk=apkmirror requires apkmirror-dlurl on apkmirror host. Got: ${apkmirrorBaseUrl}`,
    );
  }

  if (
    releaseUrl &&
    !/-release\/?$/iu.test(releaseUrl) &&
    !/\/(?:download|variant)\//iu.test(releaseUrl)
  ) {
    apkmirrorBaseUrl = apkmirrorBaseUrl || releaseUrl;
    releaseUrl = null;
  }

  if (!releaseUrl && apkmirrorBaseUrl) {
    releaseUrl = await buildApkMirrorReleaseUrlFromBase(apkmirrorBaseUrl, targetVersion, appName, ctx);
  }

  if (!releaseUrl) {
    throw new Error(
      `[${appName}] missing release_url/release-url or apkmirror-dlurl. ` +
        "Alternatively set direct download_url.",
    );
  }

  if (strictVersion && targetVersion && !versionMatchesInText(releaseUrl, targetVersion)) {
    const fromRelease = extractVersionFromApkMirrorUrl(releaseUrl);
    if (fromRelease && fromRelease !== targetVersion) {
      throw new Error(
        `[${appName}] release_url version ${fromRelease} does not match target version ${targetVersion}.`,
      );
    }
  }

  ctx.logInfo(`Request: ${releaseUrl}`);
  const html = (await ctx.runCurl(releaseUrl)).stdout.toString("utf8");
  if (looksLikeCloudflareChallenge(html)) {
    throw new Error(
      `[${appName}] ApkMirror returned Cloudflare challenge page. ` +
        "Set download_url directly or use uptodown provider.",
    );
  }

  const pageLinks = ctx.getHrefMatches(html, 'href="([^"]*(?:/apk/.+?/(?:download|variant)/[^"]*))"');
  if (pageLinks.length === 0) {
    throw new Error(
      `[${appName}] apkmirror release page does not contain a download/variant link. ` +
        "Cloudflare may be blocking scraping.",
    );
  }

  let selected = null;
  if (ctx.hasValue(app.variant_hint)) {
    const hint = String(app.variant_hint).toLowerCase();
    selected = pageLinks.find((item) => item.toLowerCase().includes(hint)) || null;
  }
  if (!selected) {
    selected = pageLinks[0];
  }

  if (strictVersion && targetVersion && !versionMatchesInText(selected, targetVersion)) {
    throw new Error(`[${appName}] selected apkmirror variant link does not match target version ${targetVersion}.`);
  }

  const selectedUrl = ctx.toAbsoluteUrl(releaseUrl, selected);
  ctx.logInfo(`Request: ${selectedUrl}`);
  const secondHtml = (await ctx.runCurl(selectedUrl)).stdout.toString("utf8");
  if (looksLikeCloudflareChallenge(secondHtml)) {
    throw new Error(
      `[${appName}] ApkMirror returned Cloudflare challenge page. ` +
        "Set download_url directly or use uptodown provider.",
    );
  }

  const directLinks = ctx.getHrefMatches(secondHtml, 'href="([^"]*download\\.php[^"]*)"');
  if (directLinks.length > 0) {
    return {
      downloadUrl: ctx.toAbsoluteUrl(selectedUrl, directLinks[0]),
      resolvedVersion: targetVersion || extractVersionFromApkMirrorUrl(releaseUrl),
    };
  }

  const fallbackLinks = ctx.getHrefMatches(secondHtml, 'href="([^"]*(?:/apk/.+?/download/[^"]*))"');
  if (fallbackLinks.length > 0) {
    const fallbackUrl = ctx.toAbsoluteUrl(selectedUrl, fallbackLinks[0]);
    ctx.logInfo(`Request: ${fallbackUrl}`);
    const thirdHtml = (await ctx.runCurl(fallbackUrl)).stdout.toString("utf8");
    const thirdDirect = ctx.getHrefMatches(thirdHtml, 'href="([^"]*download\\.php[^"]*)"');
    if (thirdDirect.length > 0) {
      return {
        downloadUrl: ctx.toAbsoluteUrl(fallbackUrl, thirdDirect[0]),
        resolvedVersion: targetVersion || extractVersionFromApkMirrorUrl(releaseUrl),
      };
    }
  }

  throw new Error(`[${appName}] unable to resolve final apkmirror download URL. Try setting download_url directly.`);
}

module.exports = {
  resolveApkMirrorDownloadUrl,
};
