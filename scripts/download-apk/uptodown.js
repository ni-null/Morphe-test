/**
 * Uptodown provider resolver.
 * Keep source-specific parsing logic isolated for easier maintenance.
 */
"use strict";

const { URL } = require("url");

function isUptodownHost(urlValue) {
  try {
    const host = new URL(String(urlValue)).host.toLowerCase();
    return host.includes("uptodown.com");
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

function extractVersionFromDownloadPage(html) {
  const matchers = [
    /<title>\s*Download[^0-9]*([0-9][0-9A-Za-z.\-]*)/iu,
    /itemprop="softwareVersion"[^>]*content="([^"]+)"/iu,
    /class="[^"]*version[^"]*"[^>]*>\s*([0-9][0-9A-Za-z.\-]*)\s*</iu,
  ];

  for (const regex of matchers) {
    const match = String(html || "").match(regex);
    if (match && match[1]) {
      return String(match[1]).trim().replace(/[^\w.\-]+$/u, "");
    }
  }
  return null;
}

async function resolveUptodownDownloadUrl(app, appName, opts, ctx) {
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

  const appUrl =
    ctx.pickFirstValue(app, ["app_url", "app-url", "uptodown_dlurl", "uptodown-dlurl"]);
  if (!appUrl) {
    throw new Error(
      `[${appName}] missing app_url/app-url or uptodown-dlurl. ` +
        "Alternatively set direct download_url.",
    );
  }
  if (!isUptodownHost(appUrl)) {
    throw new Error(`[${appName}] apk=uptodown requires uptodown host URL. Got: ${appUrl}`);
  }

  ctx.logInfo(`Request: ${appUrl}`);
  const appHtml = (await ctx.runCurl(appUrl)).stdout.toString("utf8");
  const allCandidates = [];
  allCandidates.push(...ctx.getHrefMatches(appHtml, 'href="([^"]*dw\\.uptodown\\.com/dwn/[^"]+)"'));
  allCandidates.push(...ctx.getHrefMatches(appHtml, 'href="([^"]*/download[^"]*)"'));

  if (allCandidates.length === 0) {
    throw new Error(`[${appName}] uptodown page does not contain download links.`);
  }

  const orderedCandidates = [];
  if (strictVersion && targetVersion) {
    const strictMatches = allCandidates.filter((value) => versionAppearsInText(value, targetVersion));
    orderedCandidates.push(...strictMatches);
    for (const value of allCandidates) {
      if (!strictMatches.includes(value)) {
        orderedCandidates.push(value);
      }
    }
  } else {
    const best = ctx.selectBestByVersion(allCandidates, targetVersion);
    if (best) {
      orderedCandidates.push(best);
    }
  }

  const attemptErrors = [];

  for (const candidate of orderedCandidates) {
    const candidateUrl = ctx.toAbsoluteUrl(appUrl, candidate);
    try {
      if (/dw\.uptodown\.com\/dwn\//iu.test(candidateUrl)) {
        if (strictVersion && targetVersion && !versionAppearsInText(candidateUrl, targetVersion)) {
          throw new Error(`cannot verify target version ${targetVersion} from direct URL`);
        }
        return { downloadUrl: candidateUrl, resolvedVersion: targetVersion || null };
      }

      ctx.logInfo(`Request: ${candidateUrl}`);
      const downloadPageHtml = (await ctx.runCurl(candidateUrl)).stdout.toString("utf8");
      const pageVersion = extractVersionFromDownloadPage(downloadPageHtml);

      if (strictVersion && targetVersion) {
        if (pageVersion && pageVersion !== targetVersion) {
          throw new Error(`uptodown page version ${pageVersion} does not match ${targetVersion}`);
        }
        if (!pageVersion && !versionAppearsInText(candidateUrl, targetVersion)) {
          throw new Error(`cannot confirm target version ${targetVersion} on download page`);
        }
      }

      const buttonDataUrlMatch = downloadPageHtml.match(
        /id="detail-download-button"[\s\S]*?data-url="([^"]+)"/iu,
      );
      if (buttonDataUrlMatch && buttonDataUrlMatch[1]) {
        const tokenOrUrl = buttonDataUrlMatch[1].trim();
        if (/^https?:\/\//iu.test(tokenOrUrl)) {
          return { downloadUrl: tokenOrUrl, resolvedVersion: pageVersion || targetVersion || null };
        }
        const normalized = tokenOrUrl.replace(/^\/+/u, "");
        return {
          downloadUrl: `https://dw.uptodown.com/dwn/${normalized}`,
          resolvedVersion: pageVersion || targetVersion || null,
        };
      }

      const direct = ctx.getHrefMatches(downloadPageHtml, 'href="([^"]*dw\\.uptodown\\.com/dwn/[^"]+)"');
      if (direct.length > 0) {
        return {
          downloadUrl: ctx.toAbsoluteUrl(candidateUrl, direct[0]),
          resolvedVersion: pageVersion || targetVersion || null,
        };
      }

      throw new Error("download page has no final dw.uptodown.com link");
    } catch (err) {
      attemptErrors.push(`${candidateUrl} -> ${err.message || String(err)}`);
    }
  }

  if (strictVersion && targetVersion) {
    throw new Error(
      `[${appName}] unable to find downloadable uptodown build for target version ${targetVersion}.\n` +
        attemptErrors.join("\n"),
    );
  }

  throw new Error(
    `[${appName}] unable to resolve final uptodown download URL. Try setting download_url directly.\n` +
      attemptErrors.join("\n"),
  );
}

module.exports = {
  resolveUptodownDownloadUrl,
};
