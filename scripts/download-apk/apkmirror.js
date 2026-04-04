/**
 * ApkMirror provider resolver.
 * Uses system curl for page requests to keep behavior consistent in Linux CI.
 *
 * CF-403 hardening:
 *  - Modern Chrome UA rotation
 *  - curl TLS impersonation flags (--tls-max / cipher tweaks)
 *  - Randomised delay between requests
 *  - Automatic retry with jitter on 403 / CF challenge
 *  - Extra browser-like headers (sec-fetch-*, dnt, upgrade-insecure-requests)
 */
"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { URL } = require("url");

const APKMIRROR_HOME = "https://www.apkmirror.com/";
const SEARCH_BASE = "https://www.apkmirror.com/?post_type=app_release&searchtype=apk&s=";
const FIREFOX_VERSIONS_ENDPOINT = "https://product-details.mozilla.org/1.0/firefox_versions.json";
let _curlOptionSupportPromise = null;
let _warnedMissingHttp2 = false;
let _warnedMissingTls13 = false;

// ---------- CF bypass: rotate modern Chrome UAs ----------
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

const DEFAULT_UA = USER_AGENTS[0];
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
const DEFAULT_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

// ---------- helpers ----------

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandomUA() {
  return USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)];
}

function isApkMirrorHost(urlValue) {
  try {
    const host = new URL(String(urlValue)).host.toLowerCase();
    return host.includes("apkmirror.com");
  } catch {
    return false;
  }
}

function normalizeVersion(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function normalizeTextLower(value) {
  return normalizeText(value).toLowerCase();
}

function stripHtmlTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function looksLikeCloudflareChallenge(html) {
  const lower = String(html || "").toLowerCase();
  return (
    lower.includes("just a moment") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("challenge-platform") ||
    lower.includes("enable javascript and cookies to continue") ||
    lower.includes("/cdn-cgi/challenge-platform/")
  );
}

function versionMatchesInText(text, targetVersion) {
  if (!targetVersion) {
    return true;
  }
  const value = normalizeTextLower(text);
  const spec = parseTargetVersionSpec(targetVersion);
  return spec.patterns.some((pattern) => value.includes(normalizeTextLower(pattern)));
}

function parseTargetVersionSpec(targetVersion) {
  const raw = normalizeVersion(targetVersion);
  if (!raw) {
    return {
      raw: "",
      base: "",
      buildNumber: "",
      buildFormat: "",
      dashed: "",
      patterns: [],
    };
  }

  let base = raw;
  let buildNumber = "";
  let buildFormat = "";

  const parenthesized = base.match(/\((\d+)\)\s*$/u);
  if (parenthesized) {
    buildNumber = parenthesized[1];
    buildFormat = "parentheses";
    base = base.slice(0, parenthesized.index).trim();
  } else {
    const buildSuffix = base.match(/\s+build\s+(\d+)\s*$/iu);
    if (buildSuffix) {
      buildNumber = buildSuffix[1];
      buildFormat = "build_suffix";
      base = base.slice(0, buildSuffix.index).trim();
    }
  }

  const normalizedBase = normalizeVersion(base);
  const dashed = normalizedBase.replace(/\./gu, "-");
  const patterns = [raw, normalizedBase, dashed];
  if (buildNumber && buildFormat === "parentheses") {
    patterns.push(`${normalizedBase}(${buildNumber})`);
  }
  if (buildNumber && buildFormat === "build_suffix") {
    patterns.push(`${normalizedBase} build ${buildNumber}`);
    patterns.push(`${dashed}-build-${buildNumber}`);
  }

  return {
    raw,
    base: normalizedBase,
    buildNumber,
    buildFormat,
    dashed,
    patterns: uniqueStrings(patterns),
  };
}

function getReleaseSlugCandidates(versionSpec) {
  const base = String(versionSpec && versionSpec.base ? versionSpec.base : "");
  if (!base) {
    return [];
  }

  const parts = base.split(".").filter(Boolean);
  const slugs = [];
  for (let i = parts.length; i > 0; i -= 1) {
    const currentParts = parts.slice(0, i);
    if (i === parts.length && versionSpec.buildNumber) {
      if (versionSpec.buildFormat === "build_suffix") {
        slugs.push(`${currentParts.join("-")}-build-${versionSpec.buildNumber}`);
      } else {
        const withBuild = [...currentParts];
        withBuild[withBuild.length - 1] = `${withBuild[withBuild.length - 1]}${versionSpec.buildNumber}`;
        slugs.push(withBuild.join("-"));
      }
    }
    slugs.push(currentParts.join("-"));
  }
  return uniqueStrings(slugs);
}

function parseApkBaseInfo(baseUrl, app) {
  if (!baseUrl) {
    return null;
  }

  try {
    const parsed = new URL(String(baseUrl));
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "apk") {
      return null;
    }
    const org = parts[1];
    const name = parts[2];
    const releasePrefix = String(app.release_prefix || app["release-prefix"] || name).trim() || name;
    return {
      origin: `${parsed.protocol}//${parsed.host}`,
      org,
      name,
      releasePrefix,
    };
  } catch {
    return null;
  }
}

function getExpectedAppPathPrefix(baseUrl, app) {
  const info = parseApkBaseInfo(baseUrl, app);
  if (!info) {
    return "";
  }
  return `/apk/${info.org}/${info.name}/`.toLowerCase();
}

function filterReleaseLinksByAppPath(links, expectedPathPrefix) {
  const prefix = String(expectedPathPrefix || "").trim().toLowerCase();
  if (!prefix) {
    return uniqueStrings(links);
  }
  return uniqueStrings(
    (links || []).filter((item) => {
      try {
        return new URL(String(item)).pathname.toLowerCase().startsWith(prefix);
      } catch {
        return false;
      }
    }),
  );
}

function getReleaseUrlCandidatesFromBase(baseUrl, app, versionSpec) {
  const info = parseApkBaseInfo(baseUrl, app);
  if (!info || !versionSpec || !versionSpec.base) {
    return [];
  }

  const slugs = getReleaseSlugCandidates(versionSpec);
  const urls = [];
  for (const slug of slugs) {
    urls.push(`${info.origin}/apk/${info.org}/${info.name}/${info.releasePrefix}-${slug}-release/`);
    if (info.releasePrefix !== info.name) {
      urls.push(`${info.origin}/apk/${info.org}/${info.name}/${info.name}-${slug}-release/`);
    }
    urls.push(`${info.origin}/apk/${info.org}/${info.name}/${info.releasePrefix}-${slug}/`);
    if (info.releasePrefix !== info.name) {
      urls.push(`${info.origin}/apk/${info.org}/${info.name}/${info.name}-${slug}/`);
    }
  }

  return uniqueStrings(urls);
}

function releasePageLooksLikeTarget(html, releaseUrl, versionSpec) {
  if (!versionSpec || !versionSpec.base) {
    return true;
  }
  return versionMatchesInText(`${releaseUrl}\n${String(html || "")}`, versionSpec.raw);
}

function extractVersionFromReleaseUrl(urlValue) {
  const value = String(urlValue || "");
  const match = value.match(/-([0-9]+(?:-[0-9A-Za-z]+)+)-release\/?/iu);
  return match && match[1] ? match[1].replace(/-/gu, ".") : null;
}

function qualifierRank(token) {
  const lower = String(token || "").toLowerCase();
  if (lower.includes("dev")) return -50;
  if (lower.includes("alpha")) return -40;
  if (lower.includes("beta")) return -30;
  if (lower === "rc" || lower.startsWith("rc")) return -20;
  return -10;
}

function compareVersionPart(a, b) {
  const aNum = typeof a === "number";
  const bNum = typeof b === "number";
  if (aNum && bNum) {
    return a === b ? 0 : (a > b ? 1 : -1);
  }
  if (aNum && !bNum) return 1;
  if (!aNum && bNum) return -1;
  const aRank = qualifierRank(a);
  const bRank = qualifierRank(b);
  if (aRank !== bRank) {
    return aRank > bRank ? 1 : -1;
  }
  const aText = String(a || "");
  const bText = String(b || "");
  if (aText === bText) return 0;
  return aText > bText ? 1 : -1;
}

function tokenizeVersion(versionText) {
  return String(versionText || "")
    .toLowerCase()
    .split(/[.\-]/u)
    .filter(Boolean)
    .map((part) => (/^\d+$/u.test(part) ? Number.parseInt(part, 10) : part));
}

function compareVersionText(a, b) {
  const pa = tokenizeVersion(a);
  const pb = tokenizeVersion(b);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = pa[i];
    const bv = pb[i];
    if (av === undefined && bv === undefined) return 0;
    if (av === undefined) {
      if (typeof bv === "string") return 1;
      return -1;
    }
    if (bv === undefined) {
      if (typeof av === "string") return -1;
      return 1;
    }
    const cmp = compareVersionPart(av, bv);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function pickLatestReleaseLink(releaseLinks) {
  const parsed = [];
  for (const link of releaseLinks || []) {
    const version = extractVersionFromReleaseUrl(link);
    if (version) {
      parsed.push({ link, version });
    }
  }
  if (parsed.length === 0) {
    return releaseLinks[0] || null;
  }
  parsed.sort((a, b) => compareVersionText(b.version, a.version));
  return parsed[0].link;
}

function mergeCookieHeader(rawCookie, cfClearance) {
  const chunks = [];
  if (rawCookie && String(rawCookie).trim()) {
    chunks.push(String(rawCookie).trim());
  }
  if (cfClearance && String(cfClearance).trim()) {
    const value = String(cfClearance).trim();
    const hasCf = chunks.some((item) => /(?:^|;\s*)cf_clearance=/iu.test(item));
    if (!hasCf) {
      chunks.push(`cf_clearance=${value}`);
    }
  }
  return chunks.length > 0 ? chunks.join("; ") : null;
}

function createCurlState(app, appName, opts, ctx) {
  const rawCookie = ctx.pickFirstValue(app, ["apkmirror_cookie", "apkmirror-cookie"]) ||
    process.env.APKMIRROR_COOKIE ||
    process.env.APKMIRROR_COOKIE_HEADER ||
    "";
  const cfClearance = ctx.pickFirstValue(app, ["cf_clearance", "cf-clearance"]) ||
    process.env.CF_CLEARANCE ||
    process.env.APKMIRROR_CF_CLEARANCE ||
    "";
  const cookieHeader = mergeCookieHeader(rawCookie, cfClearance);

  // Prefer explicit UA from config/env; otherwise we resolve a recent Firefox UA dynamically.
  const explicitUserAgent =
    ctx.pickFirstValue(app, ["apkmirror_user_agent", "apkmirror-user-agent"]) ||
    process.env.APKMIRROR_USER_AGENT ||
    "";
  const userAgent = explicitUserAgent || DEFAULT_UA;

  const acceptLanguage =
    ctx.pickFirstValue(app, ["apkmirror_accept_language", "apkmirror-accept-language"]) ||
    process.env.APKMIRROR_ACCEPT_LANGUAGE ||
    DEFAULT_ACCEPT_LANGUAGE;

  const preferredDir = opts && opts.destinationPath
    ? path.dirname(String(opts.destinationPath))
    : path.join(process.cwd(), "downloads");
  const cookieJarPath = path.join(preferredDir, `.apkmirror-cookie-${appName}.txt`);

  return {
    cookieJarPath,
    cookieHeader,
    explicitUserAgent,
    userAgent,
    acceptLanguage,
    accept: DEFAULT_ACCEPT,
    supportsHttp2: false,
    supportsTls13: false,
    // Keep one UA per run to avoid cookie/UA mismatch between retries.
    _ua: userAgent,
  };
}

function parseLatestFirefoxVersion(rawBody) {
  try {
    const parsed = JSON.parse(String(rawBody || "{}"));
    const value = String(parsed.LATEST_FIREFOX_VERSION || "").trim();
    if (!value) {
      return null;
    }
    const major = value.split(".")[0];
    return /^\d+$/u.test(major) ? major : null;
  } catch {
    return null;
  }
}

function buildLinuxFirefoxUA(majorVersion) {
  const major = String(majorVersion || "").trim();
  if (!/^\d+$/u.test(major)) {
    return null;
  }
  return `Mozilla/5.0 (X11; Linux x86_64; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}

async function resolveLatestFirefoxUserAgent(appName, ctx) {
  if (typeof ctx.runCommandCapture !== "function") {
    return null;
  }
  const result = await ctx.runCommandCapture("curl", ["-sfL", FIREFOX_VERSIONS_ENDPOINT]);
  if (result.code !== 0) {
    return null;
  }
  const major = parseLatestFirefoxVersion(result.stdout);
  if (!major) {
    return null;
  }
  const ua = buildLinuxFirefoxUA(major);
  if (ua && typeof ctx.logInfo === "function") {
    ctx.logInfo(`[${appName}] Using dynamic Firefox UA ${major}.x for APKMirror requests.`);
  }
  return ua;
}

async function hydrateUserAgent(state, appName, ctx) {
  if (state.explicitUserAgent) {
    state._ua = state.explicitUserAgent;
    return;
  }

  const dynamicFirefoxUa = await resolveLatestFirefoxUserAgent(appName, ctx);
  if (dynamicFirefoxUa) {
    state.userAgent = dynamicFirefoxUa;
    state._ua = dynamicFirefoxUa;
    return;
  }

  // Fall back to rotating from bundled list if endpoint is temporarily unavailable.
  const fallbackUa = pickRandomUA();
  state.userAgent = fallbackUa;
  state._ua = fallbackUa;
}

function parseCurlOptionSupport(helpText) {
  const lower = String(helpText || "").toLowerCase();
  return {
    http2: lower.includes("--http2"),
    tls13: lower.includes("--tlsv1.3"),
  };
}

async function getCurlOptionSupport(ctx) {
  if (_curlOptionSupportPromise) {
    return _curlOptionSupportPromise;
  }

  _curlOptionSupportPromise = (async () => {
    if (typeof ctx.runCommandCapture !== "function") {
      return { http2: false, tls13: false };
    }

    let result = await ctx.runCommandCapture("curl", ["--help", "all"]);
    if (result.code !== 0) {
      result = await ctx.runCommandCapture("curl", ["--help"]);
    }

    const output = `${String(result.stdout || "")}\n${String(result.stderr || "")}`;
    if (!output.trim()) {
      return { http2: false, tls13: false };
    }
    return parseCurlOptionSupport(output);
  })();

  return _curlOptionSupportPromise;
}

async function hydrateCurlOptionSupport(state, appName, ctx) {
  const support = await getCurlOptionSupport(ctx);
  state.supportsHttp2 = !!support.http2;
  state.supportsTls13 = !!support.tls13;

  if (!state.supportsHttp2 && !_warnedMissingHttp2 && typeof ctx.logWarn === "function") {
    _warnedMissingHttp2 = true;
    ctx.logWarn(`[${appName}] curl does not support --http2, using default HTTP mode.`);
  }
  if (!state.supportsTls13 && !_warnedMissingTls13 && typeof ctx.logWarn === "function") {
    _warnedMissingTls13 = true;
    ctx.logWarn(`[${appName}] curl does not support --tlsv1.3, using default TLS negotiation.`);
  }
}

// ---------- CF bypass: build browser-like curl args ----------
function buildCurlArgs(url, referer, state) {
  const args = [
    "-L",
    "--connect-timeout", "20",
    "--retry", "0",           // We handle retries ourselves
    "--silent",
    "--show-error",
    "--compressed",
    "-A", state._ua || state.userAgent,
    "-H", `Accept: ${state.accept}`,
    "-H", `Accept-Language: ${state.acceptLanguage}`,
    "-H", `Referer: ${referer || APKMIRROR_HOME}`,
    // Extra browser-like headers that help bypass CF
    "-H", "DNT: 1",
    "-H", "Upgrade-Insecure-Requests: 1",
    "-H", "Sec-Fetch-Dest: document",
    "-H", "Sec-Fetch-Mode: navigate",
    "-H", "Sec-Fetch-Site: same-origin",
    "-H", "Sec-Fetch-User: ?1",
    "-c", state.cookieJarPath,
    "-b", state.cookieJarPath,
  ];
  if (state.cookieHeader) {
    args.push("-H", `Cookie: ${state.cookieHeader}`);
  }
  if (state.supportsHttp2) {
    args.push("--http2");
  }
  if (state.supportsTls13) {
    args.push("--tlsv1.3");
  }
  return args;
}

// ---------- CF bypass: fetch with retry on 403 ----------
const STATUS_MARKER = "__MORPHE_HTTP_STATUS__:";
const RETRY_DELAY_MS_MIN = 2000;
const RETRY_DELAY_MS_MAX = 5000;

function isCiEnvironment() {
  const value = String(process.env.CI || "").trim().toLowerCase();
  return value === "1" || value === "true";
}

function getMaxCfRetries() {
  const raw = String(process.env.APKMIRROR_CF_RETRIES || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  // CI needs a few retries because APKMirror frequently serves transient CF challenge pages.
  return isCiEnvironment() ? 2 : 3;
}

async function curlFetchHtml(url, referer, appName, state, ctx) {
  if (typeof ctx.runCommandCapture !== "function") {
    throw new Error(`[${appName}] runCommandCapture is required for curl mode.`);
  }
  if (typeof ctx.ensureDir === "function") {
    await ctx.ensureDir(path.dirname(state.cookieJarPath));
  }

  let lastError = null;

  const maxCfRetries = getMaxCfRetries();
  for (let attempt = 0; attempt <= maxCfRetries; attempt += 1) {
    // Randomised delay on retries to reduce rate-limit detection
    if (attempt > 0) {
      const delay = randomInt(RETRY_DELAY_MS_MIN, RETRY_DELAY_MS_MAX);
      ctx.logInfo(`[${appName}] CF retry ${attempt}/${maxCfRetries} in ${delay}ms...`);
      await sleep(delay);
    }

    const args = buildCurlArgs(url, referer, state);
    args.push("-w", `\n${STATUS_MARKER}%{http_code}`, url);

    ctx.logInfo(`Request: ${url}`);
    const result = await ctx.runCommandCapture("curl", args);

    if (result.code !== 0) {
      const stderr = String(result.stderr || "").trim();
      const stdout = String(result.stdout || "").trim().slice(0, 300);
      lastError = new Error(`[${appName}] curl request failed: ${url}\n${stderr || stdout}`);
      // Network-level failure, no point retrying CF-specific logic
      throw lastError;
    }

    const stdout = String(result.stdout || "");
    const markerIndex = stdout.lastIndexOf(STATUS_MARKER);
    let statusCode = 0;
    let body = stdout;
    if (markerIndex >= 0) {
      body = stdout.slice(0, markerIndex).replace(/\r?\n$/u, "");
      const codeText = stdout.slice(markerIndex + STATUS_MARKER.length).trim();
      statusCode = Number.parseInt(codeText, 10) || 0;
    }

    const isCfBlocked = statusCode === 403 || looksLikeCloudflareChallenge(body);

    if (!isCfBlocked) {
      if (statusCode >= 400) {
        throw new Error(`[${appName}] apkmirror request failed (${statusCode}): ${url}`);
      }
      // Small polite delay between successful requests
      if (attempt === 0) {
        await sleep(randomInt(500, 1500));
      }
      return body;
    }

    // CF blocked: record error and retry.
    lastError = new Error(
      `[${appName}] Request blocked by Cloudflare (HTTP ${statusCode || 403}): ${url}\n` +
        "Provide apkmirror_cookie / CF_CLEARANCE env var, or wait and retry.",
    );
    ctx.logWarn(lastError.message);
  }

  throw lastError;
}

async function curlDownloadFile(url, referer, outputPath, appName, state, ctx) {
  if (typeof ctx.runCommandCapture !== "function") {
    throw new Error(`[${appName}] runCommandCapture is required for curl mode.`);
  }
  if (!outputPath || !String(outputPath).trim()) {
    throw new Error(`[${appName}] output path is required for curl file download.`);
  }
  if (typeof ctx.ensureDir === "function") {
    await ctx.ensureDir(path.dirname(outputPath));
  } else {
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  }

  const tmpPath = `${outputPath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const args = buildCurlArgs(url, referer, state);
  // --fail so curl exits non-zero on HTTP errors; -o writes to tmp file; URL must be last
  args.push("--retry", "1", "--fail", "-o", tmpPath, url);

  ctx.logInfo(`Request: ${url}`);
  const result = await ctx.runCommandCapture("curl", args);
  if (result.code !== 0) {
    const stderr = String(result.stderr || "").trim();
    try {
      await fsp.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new Error(
      `[${appName}] curl download failed: ${url}\n${stderr || "unknown curl error"}`,
    );
  }

  const stat = await fsp.stat(tmpPath);
  if (!stat || stat.size <= 0) {
    try {
      await fsp.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw new Error(`[${appName}] downloaded APK is empty: ${url}`);
  }

  if (fs.existsSync(outputPath)) {
    await fsp.unlink(outputPath);
  }
  await fsp.rename(tmpPath, outputPath);
}

// ---------- rest of the original logic (unchanged) ----------

function extractReleaseLinksFromHtml(html, baseUrl, ctx, expectedPathPrefix) {
  const links = ctx.getHrefMatches(
    html,
    'href="([^"]*(?:/apk/[^"]+?/[a-z0-9][a-z0-9-.]*-release/?[^"]*))"',
  );
  const candidates = links
      .map((item) => ctx.toAbsoluteUrl(baseUrl, item))
      .filter((item) => {
        if (!isApkMirrorHost(item) || !/-release\/?/iu.test(item)) {
          return false;
        }
        if (/disqus_thread/iu.test(item) || /#/u.test(item)) {
          return false;
        }
        return true;
      });
  return filterReleaseLinksByAppPath(candidates, expectedPathPrefix);
}

function pickBestReleaseLink(releaseLinks, targetVersion, strictVersion, appName, ctx) {
  if (!releaseLinks || releaseLinks.length === 0) {
    return null;
  }
  if (!targetVersion) {
    return pickLatestReleaseLink(releaseLinks);
  }
  const exact = releaseLinks.find((item) => versionMatchesInText(item, targetVersion));
  if (exact) {
    return exact;
  }
  if (strictVersion) {
    return null;
  }
  return ctx.selectBestByVersion(releaseLinks, targetVersion) || releaseLinks[0];
}

function buildSearchQueries(app, appName, targetVersion) {
  const keyword = String(
    app.search_keyword ||
      app["search-keyword"] ||
      app.apkmirror_search ||
      app["apkmirror-search"] ||
      appName,
  ).trim();
  if (!keyword) {
    return targetVersion ? [String(targetVersion)] : [];
  }
  if (!targetVersion) {
    return [keyword];
  }
  const withVersion = `${keyword} ${targetVersion}`;
  return withVersion === keyword ? [keyword] : [withVersion, keyword];
}

async function resolveReleaseBySearch(
  app,
  appName,
  targetVersion,
  strictVersion,
  state,
  ctx,
  expectedPathPrefix,
) {
  const queries = buildSearchQueries(app, appName, targetVersion);
  const aggregated = [];

  for (const query of queries) {
    const url = `${SEARCH_BASE}${encodeURIComponent(query)}`;
    const html = await curlFetchHtml(url, APKMIRROR_HOME, appName, state, ctx);
    const links = extractReleaseLinksFromHtml(html, url, ctx, expectedPathPrefix);
    aggregated.push(...links);
    const picked = pickBestReleaseLink(links, targetVersion, strictVersion, appName, ctx);
    if (picked) {
      return picked;
    }
  }

  const merged = uniqueStrings(aggregated);
  const fallback = pickBestReleaseLink(merged, targetVersion, strictVersion, appName, ctx);
  if (fallback) {
    return fallback;
  }
  if (strictVersion && targetVersion) {
    throw new Error(`[${appName}] apkmirror search has no release for target version ${targetVersion}.`);
  }
  throw new Error(`[${appName}] apkmirror search returned no release link.`);
}

function getVariantCriteria(app) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = app[key];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return "";
  };

  return {
    type: pick("type", "apk_type", "apk-type") || "APK",
    arch: pick("arch") || "universal",
    dpi: pick("dpi") || "nodpi",
  };
}

function isAnyCriterion(value) {
  const token = normalizeTextLower(value);
  return !token || token === "any" || token === "all" || token === "*";
}

function rowMatchesCriteria(row, criteria) {
  const typeToken = normalizeTextLower(criteria.type);
  if (!isAnyCriterion(typeToken)) {
    const hasType = row.badgesLower.includes(typeToken) || row.rowTextLower.includes(typeToken);
    if (!hasType) {
      return false;
    }
  }

  const archToken = normalizeTextLower(criteria.arch);
  if (!isAnyCriterion(archToken) && !row.rowTextLower.includes(archToken)) {
    return false;
  }

  const dpiToken = normalizeTextLower(criteria.dpi);
  if (!isAnyCriterion(dpiToken) && !row.rowTextLower.includes(dpiToken)) {
    return false;
  }

  return true;
}

function extractVariantRowsFromReleaseHtml(html, releaseUrl, ctx) {
  const source = String(html || '');
  if (!source.trim()) return [];

  // Split into per-row chunks by locating each table-row div opening tag.
  const rowChunks = [];
  const rowStartRe = new RegExp('<div[^>]*class="[^"]*table-row[^"]*"', 'giu');
  const starts = [];
  let m = null;
  while ((m = rowStartRe.exec(source)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const chunkEnd = i + 1 < starts.length ? starts[i + 1] : source.length;
    rowChunks.push(source.slice(starts[i], chunkEnd));
  }
  if (rowChunks.length === 0) rowChunks.push(source);

  // Match accent_color links pointing to APK download/bundle-download pages
  const linkPattern = '<a[^>]*class="[^"]*accent_color[^"]*"[^>]*href="([^"]*-android-apk-(?:download|bundle-download)[^"]*?)"';
  const rows = [];
  const seenUrls = new Set();

  for (const chunk of rowChunks) {
    const linkRe = new RegExp(linkPattern, 'giu');
    let match = null;
    while ((match = linkRe.exec(chunk)) !== null) {
      const href = match[1];
      const abs = ctx.toAbsoluteUrl(releaseUrl, href);
      if (!isApkMirrorHost(abs) || /disqus_thread/iu.test(abs) || /#/u.test(abs)) continue;
      if (seenUrls.has(abs)) continue;
      seenUrls.add(abs);

      const rowText = normalizeText(stripHtmlTags(chunk));
      const badgePattern = '<span[^>]*class="[^"]*apkm-badge[^"]*"[^>]*>([\s\S]*?)<\/span>';
      const badgeRe = new RegExp(badgePattern, 'giu');
      const badges = [];
      let bm = null;
      while ((bm = badgeRe.exec(chunk)) !== null) {
        badges.push(normalizeText(stripHtmlTags(bm[1])));
      }
      const badgesLower = normalizeText(badges.join(' ')).toLowerCase();
      const hasApkBadge = badges.some((b) => normalizeTextLower(b) === 'apk');
      const hasBundleBadge = badges.some((b) => normalizeTextLower(b).includes('bundle'));

      rows.push({ url: abs, versionText: rowText, rowText, rowTextLower: rowText.toLowerCase(), badgesLower, hasApkBadge, hasBundleBadge });
    }
  }
  return rows;
}

function scoreVariantRow(row, targetVersion, criteria, variantHint) {
  let score = 0;

  // Pure APK (no bundle) gets a big bonus; BUNDLE gets a big penalty
  if (row.hasApkBadge && !row.hasBundleBadge) score += 80;
  else if (row.hasBundleBadge) score -= 60;

  if (rowMatchesCriteria(row, criteria)) score += 40;
  if (targetVersion && versionMatchesInText(row.versionText + ' ' + row.rowText + ' ' + row.url, targetVersion)) {
    score += 35;
  }
  if (/-\d+-android-apk-(?:download|bundle-download)\//iu.test(row.url)) score += 18;
  if (/-android-apk-(?:download|bundle-download)\//iu.test(row.url)) score += 12;
  if (/bundle-download/iu.test(row.url)) score -= 20;
  if (variantHint && String(variantHint).trim()) {
    const hint = String(variantHint).toLowerCase();
    if (row.url.toLowerCase().includes(hint) || row.rowTextLower.includes(hint)) score += 10;
  }

  return score;
}

function rankVariantLinksByRows(releaseHtml, releaseUrl, targetVersion, strictVersion, app, appName, ctx) {
  const rows = extractVariantRowsFromReleaseHtml(releaseHtml, releaseUrl, ctx);
  if (rows.length === 0) {
    return [];
  }

  const criteria = getVariantCriteria(app);
  const versionMatchedRows = targetVersion
    ? rows.filter((row) => versionMatchesInText(`${row.versionText} ${row.rowText} ${row.url}`, targetVersion))
    : rows;

  if (targetVersion && strictVersion && versionMatchedRows.length === 0) {
    throw new Error(`[${appName}] release page has no row matching target version ${targetVersion}.`);
  }

  let candidates = rows;
  const exactAndCriteria = versionMatchedRows.filter((row) => rowMatchesCriteria(row, criteria));
  if (exactAndCriteria.length > 0) {
    candidates = exactAndCriteria;
  } else if (versionMatchedRows.length > 0) {
    candidates = versionMatchedRows;
  } else {
    const criteriaRows = rows.filter((row) => rowMatchesCriteria(row, criteria));
    if (criteriaRows.length > 0) {
      candidates = criteriaRows;
    }
  }

  return uniqueStrings(
    candidates
      .map((row) => ({
        url: row.url,
        score: scoreVariantRow(row, targetVersion, criteria, app.variant_hint || app["variant-hint"]),
      }))
      .sort((a, b) => b.score - a.score)
      .map((row) => row.url),
  );
}

function scoreVariantLink(releaseHtml, link, targetVersion) {
  const html = String(releaseHtml || "").toLowerCase();
  const lowerLink = String(link || "").toLowerCase();
  const at = html.indexOf(lowerLink);
  if (at < 0) return 0;
  const snippet = html.slice(Math.max(0, at - 1200), Math.min(html.length, at + 1200));
  let score = 0;
  if (snippet.includes("apkm-badge") && snippet.includes(">apk<")) score += 20;
  if (snippet.includes("apk")) score += 5;
  if (targetVersion && versionMatchesInText(snippet, targetVersion)) score += 8;
  if (targetVersion && versionMatchesInText(link, targetVersion)) score += 8;
  if (/-\d+-android-apk-(?:download|bundle-download)\//iu.test(link)) score += 15;
  if (/-android-apk-(?:download|bundle-download)\//iu.test(link)) score += 10;
  if (/\/variant\//iu.test(link)) score += 4;
  return score;
}

function rankVariantLinksFallback(releaseHtml, links, targetVersion, strictVersion, variantHint, appName) {
  let candidates = uniqueStrings(links || []);
  if (candidates.length === 0) return [];

  if (targetVersion && strictVersion) {
    const strictMatches = candidates.filter((item) => versionMatchesInText(item, targetVersion));
    if (strictMatches.length === 0) {
      throw new Error(`[${appName}] apkmirror variant links do not contain target version ${targetVersion}.`);
    }
    candidates = strictMatches;
  }

  if (variantHint && String(variantHint).trim()) {
    const hint = String(variantHint).toLowerCase();
    const hinted = candidates.filter((item) => String(item).toLowerCase().includes(hint));
    if (hinted.length > 0) {
      candidates = hinted;
    }
  }

  return candidates
    .map((item) => ({ item, score: scoreVariantLink(releaseHtml, item, targetVersion) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

function extractButtonLinks(html, ctx) {
  return uniqueStrings([
    ...ctx.getHrefMatches(html, '<a[^>]*class="[^"]*btn[^"]*"[^>]*href="([^"]+)"'),
    ...ctx.getHrefMatches(html, '<a[^>]*href="([^"]+)"[^>]*class="[^"]*btn[^"]*"'),
  ]);
}

function extractNofollowLinks(html, ctx) {
  return uniqueStrings([
    ...ctx.getHrefMatches(html, '<a[^>]*rel="[^"]*nofollow[^"]*"[^>]*href="([^"]+)"'),
    ...ctx.getHrefMatches(html, '<a[^>]*href="([^"]+)"[^>]*rel="[^"]*nofollow[^"]*"'),
  ]);
}

function extractVariantLinksFromReleaseHtml(html, releaseUrl, ctx) {
  const legacy = ctx.getHrefMatches(
    html,
    'href="([^"]*(?:/apk/.+?/(?:download|variant)/[^"]*))"',
  );
  const modern = ctx.getHrefMatches(
    html,
    'href="([^"]*(?:/apk/[^"]+?/[a-z0-9][^"]*?-android-apk-(?:download|bundle-download)/[^"]*))"',
  );

  const modernNumbered = modern.filter((item) =>
    /-\d+-android-apk-(?:download|bundle-download)\//iu.test(String(item || "")),
  );
  const modernPlain = modern.filter((item) => !modernNumbered.includes(item));

  return uniqueStrings(
    [...modernNumbered, ...modernPlain, ...legacy]
      .map((item) => ctx.toAbsoluteUrl(releaseUrl, item))
      .filter((item) => {
        if (!isApkMirrorHost(item)) return false;
        if (/disqus_thread/iu.test(item)) return false;
        if (/#/u.test(item)) return false;
        return true;
      }),
  );
}

// Extract the real download.php URL (or id="download-link") from any page HTML.
function extractDownloadPhpFromHtml(html, baseUrl, ctx) {
  // Priority 1: <a id="download-link" href="...">, the final link APKMirror embeds.
  const byId = ctx.getHrefMatches(html, '<a[^>]*id="download-link"[^>]*href="([^"]+)"');
  if (byId.length > 0) {
    return ctx.toAbsoluteUrl(baseUrl, String(byId[0]).replace(/&amp;/gu, "&"));
  }
  // Priority 2: any href with download.php
  const byPhp = ctx.getHrefMatches(html, 'href="([^"]*download\\.php[^"]*)"');
  if (byPhp.length > 0) {
    return ctx.toAbsoluteUrl(baseUrl, String(byPhp[0]).replace(/&amp;/gu, "&"));
  }
  return null;
}

// Follow a /download/?key= intermediate page and return the real download.php link.
async function resolveIntermediateDownloadPage(intermediateUrl, refererUrl, appName, state, ctx) {
  let url = intermediateUrl;
  if (/\/download\/\?key=/iu.test(url) && !/[?&]forcebaseapk=/iu.test(url)) {
    url = `${url}${url.includes("?") ? "&" : "?"}forcebaseapk=true`;
  }
  const html = await curlFetchHtml(url, refererUrl, appName, state, ctx);
  return extractDownloadPhpFromHtml(html, url, ctx);
}

async function resolveFinalDownloadUrl(detailsHtml, detailsUrl, appName, state, ctx) {
  // Step 1: final link already present on details page (id="download-link" or download.php)
  const directOnDetails = extractDownloadPhpFromHtml(detailsHtml, detailsUrl, ctx);
  if (directOnDetails) {
    return directOnDetails;
  }

  // Step 2: nofollow links may be /download/?key= (intermediate) or download.php (final).
  const nofollowOnDetails = extractNofollowLinks(detailsHtml, ctx);
  for (const link of nofollowOnDetails) {
    const abs = ctx.toAbsoluteUrl(detailsUrl, String(link || "").replace(/&amp;/gu, "&"));
    if (/download\.php/iu.test(abs)) {
      return abs;
    }
    if (/\/download\/\?key=/iu.test(abs)) {
      try {
        const real = await resolveIntermediateDownloadPage(abs, detailsUrl, appName, state, ctx);
        if (real) return real;
      } catch { /* try next */ }
    }
  }

  // Step 3: follow button links which may lead to the intermediate page
  const buttonLinks = extractButtonLinks(detailsHtml, ctx);
  for (const buttonLink of buttonLinks) {
    const buttonUrl = ctx.toAbsoluteUrl(detailsUrl, buttonLink);
    try {
      const buttonHtml = await curlFetchHtml(buttonUrl, detailsUrl, appName, state, ctx);
      const directOnButton = extractDownloadPhpFromHtml(buttonHtml, buttonUrl, ctx);
      if (directOnButton) return directOnButton;

      const nofollow = extractNofollowLinks(buttonHtml, ctx);
      for (const nf of nofollow) {
        const nfAbs = ctx.toAbsoluteUrl(buttonUrl, String(nf || "").replace(/&amp;/gu, "&"));
        if (/download\.php/iu.test(nfAbs)) return nfAbs;
        if (/\/download\/\?key=/iu.test(nfAbs)) {
          try {
            const real = await resolveIntermediateDownloadPage(nfAbs, buttonUrl, appName, state, ctx);
            if (real) return real;
          } catch { /* try next */ }
        }
      }
    } catch { /* try next button */ }
  }

  // Step 4: last resort, follow any /apk/.../download/ link.
  const fallback = ctx.getHrefMatches(detailsHtml, 'href="([^"]*(?:/apk/.+?/download/[^"]*))"');
  if (fallback.length > 0) {
    const fallbackUrl = ctx.toAbsoluteUrl(detailsUrl, fallback[0]);
    try {
      const fallbackHtml = await curlFetchHtml(fallbackUrl, detailsUrl, appName, state, ctx);
      const fromFallback = extractDownloadPhpFromHtml(fallbackHtml, fallbackUrl, ctx);
      if (fromFallback) return fromFallback;
    } catch { /* ignore */ }
  }

  return null;
}

async function resolveApkMirrorDownloadUrl(app, appName, opts, ctx) {
  const targetVersion = opts && opts.targetVersion ? normalizeVersion(opts.targetVersion) : null;
  const versionSpec = parseTargetVersionSpec(targetVersion);
  const strictVersion = !!(opts && opts.strictVersion);
  const destinationPath = opts && opts.destinationPath ? String(opts.destinationPath) : null;

  const direct = ctx.pickFirstValue(app, ["download_url", "download-url", "direct_dlurl", "direct-dlurl"]);
  if (direct) {
    if (strictVersion && targetVersion && !versionMatchesInText(direct, targetVersion)) {
      throw new Error(`[${appName}] direct download URL does not contain target version ${targetVersion}.`);
    }
    return { downloadUrl: direct, resolvedVersion: targetVersion || null };
  }

  let releaseUrl = ctx.pickFirstValue(app, ["release_url", "release-url"]);
  let baseUrl =
    ctx.pickFirstValue(app, ["apkmirror_dlurl", "apkmirror-dlurl"]);
  const expectedPathPrefix = getExpectedAppPathPrefix(baseUrl || releaseUrl, app);

  if (releaseUrl && !isApkMirrorHost(releaseUrl)) {
    throw new Error(`[${appName}] release_url must be apkmirror host. Got: ${releaseUrl}`);
  }
  if (baseUrl && !isApkMirrorHost(baseUrl)) {
    throw new Error(`[${appName}] apkmirror-dlurl must be apkmirror host. Got: ${baseUrl}`);
  }

  if (
    releaseUrl &&
    !/-release\/?$/iu.test(releaseUrl) &&
    !/\/(?:download|variant)\//iu.test(releaseUrl)
  ) {
    baseUrl = baseUrl || releaseUrl;
    releaseUrl = null;
  }

  const state = createCurlState(app, appName, opts, ctx);
  await hydrateUserAgent(state, appName, ctx);
  await hydrateCurlOptionSupport(state, appName, ctx);
  if (!isCiEnvironment()) {
    try {
      await curlFetchHtml(APKMIRROR_HOME, APKMIRROR_HOME, appName, state, ctx);
    } catch (err) {
      ctx.logWarn(
        `[${appName}] apkmirror home warm-up skipped: ${err && err.message ? err.message : String(err)}`,
      );
    }
  }

  if (!releaseUrl && baseUrl && versionSpec.base) {
    const generated = getReleaseUrlCandidatesFromBase(baseUrl, app, versionSpec);
    for (const candidateUrl of generated) {
      try {
        const html = await curlFetchHtml(candidateUrl, APKMIRROR_HOME, appName, state, ctx);
        if (releasePageLooksLikeTarget(html, candidateUrl, versionSpec)) {
          releaseUrl = candidateUrl;
          break;
        }
      } catch {
        // Try the next candidate URL.
      }
    }
  }

  if (!releaseUrl && baseUrl) {
    const normalizedBase = String(baseUrl).replace(/\/+$/u, "");
    const baseHtml = await curlFetchHtml(normalizedBase, APKMIRROR_HOME, appName, state, ctx);
    const links = extractReleaseLinksFromHtml(baseHtml, normalizedBase, ctx, expectedPathPrefix);
    releaseUrl = pickBestReleaseLink(links, targetVersion, strictVersion, appName, ctx);
  }

  if (!releaseUrl) {
    releaseUrl = await resolveReleaseBySearch(
      app,
      appName,
      targetVersion,
      strictVersion,
      state,
      ctx,
      expectedPathPrefix,
    );
  }

  if (!releaseUrl) {
    throw new Error(`[${appName}] unable to resolve release URL from apkmirror.`);
  }

  if (strictVersion && targetVersion && !versionMatchesInText(releaseUrl, targetVersion)) {
    const found = extractVersionFromReleaseUrl(releaseUrl);
    if (found && !versionMatchesInText(found, targetVersion)) {
      throw new Error(`[${appName}] release version ${found} does not match ${targetVersion}.`);
    }
  }

  const releaseHtml = await curlFetchHtml(releaseUrl, APKMIRROR_HOME, appName, state, ctx);
  let rankedVariants = rankVariantLinksByRows(
    releaseHtml,
    releaseUrl,
    targetVersion,
    strictVersion,
    app,
    appName,
    ctx,
  );
  if (rankedVariants.length === 0) {
    const variantLinks = extractVariantLinksFromReleaseHtml(releaseHtml, releaseUrl, ctx);
    if (variantLinks.length === 0) {
      throw new Error(`[${appName}] release page has no download/variant link.`);
    }
    rankedVariants = rankVariantLinksFallback(
      releaseHtml,
      variantLinks,
      targetVersion,
      strictVersion,
      app.variant_hint || app["variant-hint"],
      appName,
    );
  }
  if (rankedVariants.length === 0) {
    throw new Error(`[${appName}] failed to select a variant link.`);
  }

  const attemptErrors = [];
  for (const variant of rankedVariants) {
    const detailsUrl = ctx.toAbsoluteUrl(releaseUrl, variant);
    try {
      const detailsHtml = await curlFetchHtml(detailsUrl, releaseUrl, appName, state, ctx);
      const finalUrl = await resolveFinalDownloadUrl(detailsHtml, detailsUrl, appName, state, ctx);
      if (!finalUrl) {
        throw new Error("unable to resolve final download URL from details page");
      }

      if (destinationPath) {
        await curlDownloadFile(finalUrl, detailsUrl, destinationPath, appName, state, ctx);
        return {
          localPath: destinationPath,
          resolvedVersion: targetVersion || extractVersionFromReleaseUrl(releaseUrl) || null,
        };
      }

      return {
        downloadUrl: finalUrl,
        resolvedVersion: targetVersion || extractVersionFromReleaseUrl(releaseUrl) || null,
      };
    } catch (err) {
      attemptErrors.push(`${detailsUrl} -> ${err && err.message ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `[${appName}] all apkmirror variant candidates failed.\n${attemptErrors.join("\n")}`,
  );
}

module.exports = {
  resolveApkMirrorDownloadUrl,
};
