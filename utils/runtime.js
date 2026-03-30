"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn } = require("child_process");

const ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const CURL_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:108.0) Gecko/20100101 Firefox/108.0";

function summarizeRequestError(url, statusCode, responsePreview, originalMessage) {
  const preview = String(responsePreview || "").slice(0, 700);

  const lowerUrl = String(url || "").toLowerCase();
  const lowerErr = `${String(originalMessage || "")}\n${preview}`.toLowerCase();
  if (
    lowerUrl.includes("apkmirror.com") &&
    (statusCode === 403 || lowerErr.includes("returned error: 403") || lowerErr.includes("error: 22"))
  ) {
    return (
      `Request blocked by Cloudflare (HTTP 403): ${url}\n` +
      "Set app.download_url directly or switch provider to uptodown."
    );
  }

  const statusLine = statusCode ? `(${statusCode}) ` : "";
  return `Request failed ${statusLine}for ${url}\n${preview || String(originalMessage || "")}`;
}

function responseHeadersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

async function readResponsePreview(response) {
  try {
    const text = await response.text();
    return String(text || "").slice(0, 700);
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Please use Node.js 18+.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function createRuntime(params) {
  const { logStep } = params;

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

  async function runCurl(url, outputPath = null, requestOptions = null) {
    const opts = requestOptions || {};
    const requestHeaders = {
      "User-Agent": CURL_USER_AGENT,
      "Accept-Language": ACCEPT_LANGUAGE,
      ...(opts && opts.headers ? opts.headers : {}),
    };
    const allowHttpErrorBody = !!(opts && opts.allowHttpErrorBody);
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 10000;

    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: requestHeaders,
        },
        timeoutMs,
      );

      const status = Number(response.status || 0);
      const valid = allowHttpErrorBody ? status >= 200 && status < 500 : status >= 200 && status < 300;

      if (!valid) {
        const preview = await readResponsePreview(response);
        throw new Error(summarizeRequestError(url, status, preview, `HTTP ${status}`));
      }

      if (outputPath) {
        await ensureDir(path.dirname(outputPath));
        if (!response.body) {
          throw new Error(`Request failed for ${url}\nResponse body is empty.`);
        }

        const bodyStream = Readable.fromWeb(response.body);
        await pipeline(bodyStream, fs.createWriteStream(outputPath));
        return {
          stdout: Buffer.alloc(0),
          statusCode: status,
          headers: responseHeadersToObject(response.headers),
        };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        stdout: buffer,
        statusCode: status,
        headers: responseHeadersToObject(response.headers),
      };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      if (/^Request failed /u.test(message)) {
        throw err;
      }
      throw new Error(summarizeRequestError(url, null, "", message));
    }
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

  async function downloadFile(url, outFile, label = "file") {
    logStep(`Downloading ${label} -> ${outFile}`);
    await ensureDir(path.dirname(outFile));
    if (await fileExists(outFile)) {
      await fsp.unlink(outFile);
    }

    const tmpFile = `${outFile}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await runCurl(url, tmpFile);
      await fsp.rename(tmpFile, outFile);
    } catch (err) {
      try {
        await fsp.unlink(tmpFile);
      } catch {
        // Ignore temp cleanup failure.
      }
      throw err;
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
