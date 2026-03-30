"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { pipeline } = require("stream/promises");
const { spawn } = require("child_process");
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

const ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const CURL_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:108.0) Gecko/20100101 Firefox/108.0";

function summarizeRequestError(url, err) {
  const statusCode = err && err.response && err.response.status ? err.response.status : null;
  let responsePreview = "";
  if (err && err.response && err.response.data) {
    const data = err.response.data;
    if (Buffer.isBuffer(data)) {
      responsePreview = data.toString("utf8");
    } else if (typeof data === "string") {
      responsePreview = data;
    } else if (typeof data === "object") {
      responsePreview = JSON.stringify(data);
    }
  }
  responsePreview = String(responsePreview || "").slice(0, 700);

  const lowerUrl = String(url || "").toLowerCase();
  const lowerErr = `${String(err && err.message ? err.message : "")}\n${responsePreview}`.toLowerCase();
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
  return `Request failed ${statusLine}for ${url}\n${responsePreview || String(err && err.message ? err.message : err)}`;
}

function createRuntime(params) {
  const { cookieJarPath, logStep } = params;
  let axiosClientPromise = null;

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

  async function buildAxiosClient() {
    await ensureDir(path.dirname(cookieJarPath));

    let jar = new CookieJar();
    try {
      if (await fileExists(cookieJarPath)) {
        const jsonText = await fsp.readFile(cookieJarPath, "utf8");
        const parsed = JSON.parse(jsonText);
        jar = CookieJar.fromJSON(parsed);
      }
    } catch {
      // Ignore cookie restore failure and use a new jar.
      jar = new CookieJar();
    }

    const client = wrapper(
      axios.create({
        timeout: 10000,
        maxRedirects: 10,
        jar,
        withCredentials: true,
        headers: {
          "User-Agent": CURL_USER_AGENT,
          "Accept-Language": ACCEPT_LANGUAGE,
        },
        validateStatus(status) {
          return status >= 200 && status < 300;
        },
      }),
    );

    return { client, jar };
  }

  async function getAxiosClient() {
    if (!axiosClientPromise) {
      axiosClientPromise = buildAxiosClient();
    }
    return axiosClientPromise;
  }

  async function persistCookieJar(jar) {
    try {
      await ensureDir(path.dirname(cookieJarPath));
      await fsp.writeFile(cookieJarPath, JSON.stringify(jar.toJSON(), null, 2), "utf8");
    } catch {
      // Ignore cookie persist failure.
    }
  }

  async function runCurl(url, outputPath = null) {
    const { client, jar } = await getAxiosClient();

    try {
      if (outputPath) {
        await ensureDir(path.dirname(outputPath));
        const response = await client.get(url, { responseType: "stream" });
        await pipeline(response.data, fs.createWriteStream(outputPath));
        await persistCookieJar(jar);
        return { stdout: Buffer.alloc(0) };
      }

      const response = await client.get(url, { responseType: "arraybuffer" });
      await persistCookieJar(jar);
      return { stdout: Buffer.from(response.data) };
    } catch (err) {
      throw new Error(summarizeRequestError(url, err));
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
