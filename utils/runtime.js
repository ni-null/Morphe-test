"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const CURL_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:108.0) Gecko/20100101 Firefox/108.0";
const HTTP_STATUS_MARKER = "__MORPHE_HTTP_STATUS__:";

function getGitHubApiTimeoutMs() {
  const raw = String(process.env.GITHUB_API_TIMEOUT || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 30000; // 預設 30 秒
}

function getPageTimeoutMs() {
  const raw = String(process.env.MORPHE_PAGE_TIMEOUT_MS || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 10000; // 預設 10 秒
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_HTTP_CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_CACHE_TTL_MS = 60 * 1000;

function getDownloadTimeoutMs() {
  const raw = String(process.env.MORPHE_DOWNLOAD_TIMEOUT_MS || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_DOWNLOAD_TIMEOUT_MS;
}

function getHttpCacheTtlMs() {
  const raw = String(process.env.MORPHE_HTTP_CACHE_TTL_MS || "").trim();
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_HTTP_CACHE_TTL_MS;
}

function buildRuntimeHeaders(url, requestOptions) {
  const opts = requestOptions || {};
  const headers = {
    "Accept-Language": ACCEPT_LANGUAGE,
    "User-Agent": CURL_USER_AGENT,
    ...(opts.headers || {}),
  };
  const lowerUrl = String(url || "").toLowerCase();
  if (lowerUrl.startsWith("https://api.github.com/")) {
    const hasAuth = Object.keys(headers).some((key) => key.toLowerCase() === "authorization");
    const token = String(process.env.GITHUB_TOKEN || "").trim();
    if (!hasAuth && token) {
      headers.Authorization = `Bearer ${token}`;
      if (!headers["X-GitHub-Api-Version"]) {
        headers["X-GitHub-Api-Version"] = "2022-11-28";
      }
    }
  }
  return headers;
}

function resolveHeaderValue(headers, keyName) {
  const target = String(keyName || "").toLowerCase();
  const found = Object.keys(headers || {}).find((key) => String(key).toLowerCase() === target);
  if (!found) return "";
  return String(headers[found] || "");
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function summarizeRequestError(url, statusCode, responsePreview, originalMessage) {
  const preview = String(responsePreview || "").slice(0, 700);
  const cleanedPreview = preview
    .replace(/\r?\n?__MORPHE_HTTP_STATUS__:\d+\s*$/u, "")
    .trim();
  const original = String(originalMessage || "").trim();

  const lowerUrl = String(url || "").toLowerCase();
  const lowerErr = `${original}\n${cleanedPreview}`.toLowerCase();
  if (
    lowerUrl.includes("apkmirror.com") &&
    (statusCode === 403 || lowerErr.includes("returned error: 403") || lowerErr.includes("error: 22"))
  ) {
    return (
      `Request blocked by Cloudflare (HTTP 403): ${url}\n` +
      "Set provider URL directly (apkmirror-dlurl / uptodown-dlurl / archive-dlurl), or use fallback source."
    );
  }

  const statusLine = statusCode ? `(${statusCode}) ` : "";
  return `Request failed ${statusLine}for ${url}\n${original || cleanedPreview || "unknown error"}`;
}

function createRuntime(params) {
  const { cookieJarPath, logStep, cacheDir } = params;
  const httpCacheDir = cacheDir ? path.join(cacheDir, "http-url") : "";

  async function ensureDir(dirPath) {
    await fsp.mkdir(dirPath, { recursive: true });
  }

  async function fileExists(filePath) {
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async function removeDirRecursive(dirPath) {
    await fsp.rm(dirPath, { recursive: true, force: true });
  }

  function runCommandCapture(command, args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const stdoutChunks = [];
      const stderrChunks = [];
      child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
      child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
      child.on("error", (err) => reject(new Error(`Failed to start ${command}: ${err.message}`)));
      child.on("close", (code) => {
        resolve({
          code,
          stdout: Buffer.concat(stdoutChunks).toString("utf8"),
          stderr: Buffer.concat(stderrChunks).toString("utf8"),
        });
      });
    });
  }

  function buildCurlArgs(url, outputPath, requestOptions) {
    const opts = requestOptions || {};
    const isGitHubApi = String(url || "").toLowerCase().startsWith("https://api.github.com/");
    const timeoutMs = Number.isFinite(opts.timeoutMs)
      ? opts.timeoutMs
      : (outputPath ? getDownloadTimeoutMs() : (isGitHubApi ? getGitHubApiTimeoutMs() : getPageTimeoutMs()));
    const timeoutSec = Math.max(10, Math.ceil(timeoutMs / 1000));
    const headers = buildRuntimeHeaders(url, opts);

    const args = [
      "-L",
      "--connect-timeout", "20",
      "--max-time", String(timeoutSec),
      "--retry", "1",
      "--silent",
      "--show-error",
      "--compressed",
      "-A", String(headers["User-Agent"] || CURL_USER_AGENT),
    ];

    // Keep curl cookie state between requests within one run.
    if (cookieJarPath) {
      args.push("-c", cookieJarPath, "-b", cookieJarPath);
    }

    const headerEntries = Object.entries(headers)
      .filter(([key, value]) => key.toLowerCase() !== "user-agent" && value !== undefined && value !== null);
    for (const [key, value] of headerEntries) {
      args.push("-H", `${key}: ${String(value)}`);
    }

    if (outputPath) {
      args.push("-o", outputPath);
    }
    args.push("-w", `\n${HTTP_STATUS_MARKER}%{http_code}`, url);
    return args;
  }

  function parseCurlOutput(rawStdout) {
    const stdout = String(rawStdout || "");
    const markerIndex = stdout.lastIndexOf(HTTP_STATUS_MARKER);
    if (markerIndex < 0) {
      return { body: stdout, statusCode: 0 };
    }
    const body = stdout.slice(0, markerIndex).replace(/\r?\n$/u, "");
    const codeText = stdout.slice(markerIndex + HTTP_STATUS_MARKER.length).trim();
    return {
      body,
      statusCode: Number.parseInt(codeText, 10) || 0,
    };
  }

  function shouldUseUrlCache(url, outputPath, requestOptions) {
    if (!cacheDir || !httpCacheDir) return false;
    if (outputPath) return false;
    const opts = requestOptions || {};
    if (opts.disableCache === true) return false;
    const method = String(opts.method || "GET").trim().toUpperCase();
    if (method !== "GET") return false;
    return /^https?:\/\//iu.test(String(url || "").trim());
  }

  function buildUrlCacheKey(url, requestOptions) {
    const opts = requestOptions || {};
    const headers = buildRuntimeHeaders(url, opts);
    const headerFingerprint = {
      accept: resolveHeaderValue(headers, "accept"),
      language: resolveHeaderValue(headers, "accept-language"),
      authorization: hashText(resolveHeaderValue(headers, "authorization")),
      githubVersion: resolveHeaderValue(headers, "x-github-api-version"),
    };
    const payload = {
      method: String(opts.method || "GET").trim().toUpperCase(),
      url: String(url || "").trim(),
      headers: headerFingerprint,
    };
    return hashText(JSON.stringify(payload));
  }

  async function readUrlCache(url, requestOptions) {
    const key = buildUrlCacheKey(url, requestOptions);
    const cachePath = path.join(httpCacheDir, `${key}.json`);
    if (!(await fileExists(cachePath))) {
      return null;
    }
    try {
      const raw = await fsp.readFile(cachePath, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/u, ""));
      const now = Date.now();
      if (!parsed || !Number.isFinite(parsed.expiresAt) || now > Number(parsed.expiresAt)) {
        await fsp.rm(cachePath, { force: true });
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async function writeUrlCache(url, requestOptions, data) {
    const key = buildUrlCacheKey(url, requestOptions);
    const cachePath = path.join(httpCacheDir, `${key}.json`);
    await ensureDir(httpCacheDir);
    await fsp.writeFile(cachePath, `${JSON.stringify(data)}\n`, "utf8");
  }

  async function runCurl(url, outputPath = null, requestOptions = null) {
    if (cookieJarPath) {
      await ensureDir(path.dirname(cookieJarPath));
    }
    if (outputPath) {
      await ensureDir(path.dirname(outputPath));
    }

    const opts = requestOptions || {};
    const enableCache = shouldUseUrlCache(url, outputPath, opts);
    if (enableCache) {
      const cached = await readUrlCache(url, opts);
      if (cached) {
        if (cached.error === true || !(cached.statusCode >= 200 && cached.statusCode < 300)) {
          throw new Error(
            summarizeRequestError(
              url,
              Number(cached.statusCode) || 0,
              String(cached.body || ""),
              `HTTP ${cached.statusCode} (cached)`,
            ),
          );
        }
        return {
          stdout: Buffer.from(String(cached.body || ""), "utf8"),
          statusCode: Number(cached.statusCode) || 200,
          headers: {},
        };
      }
    }

    const allowHttpErrorBody = !!opts.allowHttpErrorBody;
    const args = buildCurlArgs(url, outputPath, opts);
    const result = await runCommandCapture("curl", args);

    if (result.code !== 0) {
      throw new Error(
        summarizeRequestError(
          url,
          null,
          String(result.stdout || ""),
          String(result.stderr || "").trim() || "curl command failed",
        ),
      );
    }

    const { body, statusCode } = parseCurlOutput(result.stdout);
    const valid = allowHttpErrorBody ? statusCode >= 200 && statusCode < 500 : statusCode >= 200 && statusCode < 300;
    if (!valid) {
      if (enableCache && (statusCode === 403 || statusCode === 429)) {
        await writeUrlCache(url, opts, {
          savedAt: Date.now(),
          expiresAt: Date.now() + RATE_LIMIT_CACHE_TTL_MS,
          statusCode,
          body: String(body || ""),
          error: true,
        });
      }
      throw new Error(summarizeRequestError(url, statusCode, body, `HTTP ${statusCode}`));
    }

    if (enableCache && statusCode >= 200 && statusCode < 300) {
      await writeUrlCache(url, opts, {
        savedAt: Date.now(),
        expiresAt: Date.now() + getHttpCacheTtlMs(),
        statusCode,
        body: String(body || ""),
        error: false,
      });
    }

    return {
      stdout: Buffer.from(body || "", "utf8"),
      statusCode,
      headers: {},
    };
  }

  async function downloadFile(url, outFile, label = "file") {
    logStep(`Downloading ${label} -> ${outFile}`);
    await ensureDir(path.dirname(outFile));
    if (await fileExists(outFile)) {
      await fsp.unlink(outFile);
    }

    const maxAttempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const tmpFile = `${outFile}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        await runCurl(url, tmpFile, { timeoutMs: getDownloadTimeoutMs() });
        await fsp.rename(tmpFile, outFile);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        try {
          await fsp.unlink(tmpFile);
        } catch {
          // Ignore temp cleanup failure.
        }
        if (attempt < maxAttempts) {
          const delayMs = 1000 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const stat = await fsp.stat(outFile);
    if (stat.size <= 0) {
      throw new Error(`Downloaded file is empty: ${outFile}`);
    }
  }

  return {
    ensureDir,
    fileExists,
    removeDirRecursive,
    runCurl,
    runCommandCapture,
    downloadFile,
  };
}

module.exports = {
  createRuntime,
};
