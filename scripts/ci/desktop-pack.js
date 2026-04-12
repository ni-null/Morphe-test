"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PACK_ARGS = ["--projectDir", "..", "--win", "portable"];

function resolveRepoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function resolveDesktopDir(repoRoot) {
  return path.join(repoRoot, "desktop");
}

function readRootPackageJson(repoRoot) {
  const packagePath = path.join(repoRoot, "package.json");
  const raw = fs.readFileSync(packagePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/u, ""));
}

function resolveProductExecutableNames(repoRoot) {
  const pkg = readRootPackageJson(repoRoot);
  const productName = String((pkg && pkg.build && pkg.build.productName) || pkg.name || "app").trim();
  const version = String(pkg && pkg.version ? pkg.version : "").trim();
  const names = new Set();
  if (productName) {
    names.add(`${productName}.exe`);
    if (version) names.add(`${productName} ${version}.exe`);
  }
  return Array.from(names);
}

function resolveOutputDir(repoRoot) {
  return path.join(repoRoot, "dist", "win-unpacked");
}

function resolveElectronBuilderCli(repoRoot) {
  const candidates = [
    path.join(repoRoot, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    path.join(repoRoot, "desktop", "node_modules", "electron-builder", "out", "cli", "cli.js"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("electron-builder CLI not found. Run npm install first.");
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let merged = "";
    child.stdout.on("data", (chunk) => {
      const text = String(chunk || "");
      if (!text) return;
      merged += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk || "");
      if (!text) return;
      merged += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      const message = error && error.message ? error.message : String(error);
      merged += `\n${message}\n`;
      resolve({ code: -1, output: merged });
    });
    child.on("close", (code) => {
      resolve({ code: typeof code === "number" ? code : -1, output: merged });
    });
  });
}

function isLockedExecutableError(output, executableNames) {
  const text = String(output || "");
  const hasLockSignal = /EBUSY: resource busy or locked/iu.test(text) || /Access is denied/iu.test(text);
  if (!hasLockSignal) return false;
  const names = Array.isArray(executableNames) ? executableNames : [];
  if (names.length === 0) return true;
  return names.some((name) => {
    const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escapedName, "iu").test(text);
  });
}

function cleanOutputDir(outputDir) {
  try {
    fs.rmSync(outputDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  } catch {
    // Retry path is handled by build command; ignore cleanup failure here.
  }
}

async function killRunningPortableApp(executableNames) {
  if (process.platform !== "win32") return;
  const names = Array.isArray(executableNames) ? executableNames : [];
  for (const name of names) {
    const imageName = String(name || "").trim();
    if (!imageName) continue;
    await runProcess("taskkill", ["/IM", imageName, "/T", "/F"], { cwd: process.cwd() });
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runPackAttempt({ desktopDir, outputDir, builderCli, attempt }) {
  cleanOutputDir(outputDir);
  console.log(`[desktop-pack] Attempt ${attempt}: electron-builder ${PACK_ARGS.join(" ")}`);
  return await runProcess(process.execPath, [builderCli, ...PACK_ARGS], {
    cwd: desktopDir,
    env: process.env,
  });
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const desktopDir = resolveDesktopDir(repoRoot);
  const outputDir = resolveOutputDir(repoRoot);
  const builderCli = resolveElectronBuilderCli(repoRoot);
  const executableNames = resolveProductExecutableNames(repoRoot);

  if (process.platform === "win32") {
    await killRunningPortableApp(executableNames);
    await sleep(300);
  }

  const first = await runPackAttempt({
    desktopDir,
    outputDir,
    builderCli,
    attempt: 1,
  });
  if (first.code === 0) {
    process.exit(0);
    return;
  }

  if (process.platform === "win32" && isLockedExecutableError(first.output, executableNames)) {
    console.warn("[desktop-pack] Detected locked executable. Killing old app process and retrying once.");
    await killRunningPortableApp(executableNames);
    await sleep(500);
    const second = await runPackAttempt({
      desktopDir,
      outputDir,
      builderCli,
      attempt: 2,
    });
    process.exit(second.code);
    return;
  }

  process.exit(first.code);
}

main().catch((error) => {
  const message = error && error.stack ? error.stack : String(error);
  console.error(`[desktop-pack] Fatal: ${message}`);
  process.exit(1);
});
