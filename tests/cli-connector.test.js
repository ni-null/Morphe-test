"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveCliExecPath, resolveSpawnCwd } = require("../desktop/ipc/cli-connector");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("resolveCliExecPath prefers process.execPath when available", () => {
  const env = {
    PORTABLE_EXECUTABLE_FILE: "C:\\Apps\\APK Patches Studio Portable.exe",
  };
  const selected = resolveCliExecPath(env, {
    platform: "win32",
    execPath: "C:\\Users\\nin\\AppData\\Local\\Temp\\abc\\APK Patches Studio.exe",
    fileExists: (targetPath) =>
      targetPath === "C:\\Users\\nin\\AppData\\Local\\Temp\\abc\\APK Patches Studio.exe" ||
      targetPath === "C:\\Apps\\APK Patches Studio Portable.exe",
  });
  assert.strictEqual(selected, "C:\\Users\\nin\\AppData\\Local\\Temp\\abc\\APK Patches Studio.exe");
});

runTest("resolveCliExecPath uses PORTABLE_EXECUTABLE_FILE when execPath is unavailable", () => {
  const env = {
    PORTABLE_EXECUTABLE_FILE: "C:\\Apps\\APK Patches Studio Portable.exe",
  };
  const selected = resolveCliExecPath(env, {
    platform: "win32",
    execPath: "C:\\Users\\nin\\AppData\\Local\\Temp\\abc\\APK Patches Studio.exe",
    fileExists: (targetPath) => targetPath === "C:\\Apps\\APK Patches Studio Portable.exe",
  });
  assert.strictEqual(selected, "C:\\Apps\\APK Patches Studio Portable.exe");
});

runTest("resolveCliExecPath falls back to execPath when portable path is unavailable", () => {
  const selected = resolveCliExecPath({}, {
    platform: "win32",
    execPath: "C:\\Program Files\\APK Patches Studio\\APK Patches Studio.exe",
    fileExists: (targetPath) => targetPath === "C:\\Program Files\\APK Patches Studio\\APK Patches Studio.exe",
  });
  assert.strictEqual(selected, "C:\\Program Files\\APK Patches Studio\\APK Patches Studio.exe");
});

runTest("resolveCliExecPath ignores portable path on non-win32 platforms", () => {
  const env = {
    PORTABLE_EXECUTABLE_FILE: "/opt/apk-patcher-portable",
  };
  const selected = resolveCliExecPath(env, {
    platform: "linux",
    execPath: "/usr/bin/electron",
    fileExists: (targetPath) => targetPath === "/usr/bin/electron",
  });
  assert.strictEqual(selected, "/usr/bin/electron");
});

runTest("resolveSpawnCwd avoids app.asar virtual directory", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yt-patcher-spawn-cwd-"));
  const resourcesDir = path.join(tempRoot, "resources");
  const asarDir = path.join(resourcesDir, "app.asar");
  fs.mkdirSync(asarDir, { recursive: true });
  try {
    const resolved = resolveSpawnCwd(asarDir, path.join(tempRoot, "APK Patches Studio.exe"));
    assert.strictEqual(path.normalize(resolved), path.normalize(resourcesDir));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
