"use strict";

const assert = require("assert");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const { resolveSigningConfig } = require("../utils/signing");
const { getDefaultWorkspaceRoot } = require("../utils/workspace");
const { getPageTimeoutMs, getDownloadTimeoutMs, getHttpCacheTtlMs } = require("../utils/runtime");
const { resolveEnvWithLegacy, warnLegacyEnvUsage } = require("../utils/env-alias");

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createRuntime() {
  return {
    async fileExists(targetPath) {
      try {
        await fsp.access(targetPath, fs.constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    async ensureDir(targetPath) {
      await fsp.mkdir(targetPath, { recursive: true });
    },
  };
}

async function withTempDir(callback) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "yt-patcher-env-alias-"));
  try {
    await callback(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function main() {
  await runTest("resolveEnvWithLegacy prefers primary key", async () => {
    const resolution = resolveEnvWithLegacy(
      { PATCH_WORKSPACE: "/new", MORPHE_WORKSPACE: "/old" },
      "PATCH_WORKSPACE",
      ["MORPHE_WORKSPACE"],
    );
    assert.strictEqual(resolution.value, "/new");
    assert.strictEqual(resolution.sourceKey, "PATCH_WORKSPACE");
    assert.strictEqual(resolution.isLegacy, false);
  });

  await runTest("resolveEnvWithLegacy falls back to legacy key", async () => {
    const resolution = resolveEnvWithLegacy(
      { MORPHE_WORKSPACE: "/old" },
      "PATCH_WORKSPACE",
      ["MORPHE_WORKSPACE"],
    );
    assert.strictEqual(resolution.value, "/old");
    assert.strictEqual(resolution.sourceKey, "MORPHE_WORKSPACE");
    assert.strictEqual(resolution.isLegacy, true);
  });

  await runTest("warnLegacyEnvUsage warns only once per alias pair", async () => {
    const resolution = resolveEnvWithLegacy(
      { MORPHE_KEYSTORE_PATH: "/tmp/legacy.keystore" },
      "PATCH_KEYSTORE_PATH",
      ["MORPHE_KEYSTORE_PATH"],
    );
    let count = 0;
    const warn = () => {
      count += 1;
    };
    warnLegacyEnvUsage(resolution, "PATCH_KEYSTORE_PATH", warn);
    warnLegacyEnvUsage(resolution, "PATCH_KEYSTORE_PATH", warn);
    assert.strictEqual(count, 1);
  });

  await runTest("resolveSigningConfig accepts PATCH_KEYSTORE_PATH", async () => {
    await withTempDir(async (tmpDir) => {
      const keystorePath = path.join(tmpDir, "custom.keystore");
      await fsp.writeFile(keystorePath, Buffer.from("dummy-keystore"));
      const result = await resolveSigningConfig({
        configDir: tmpDir,
        projectRoot: tmpDir,
        workspaceDir: tmpDir,
        preferWorkspaceKeystore: false,
        signingCfg: {},
        runtime: createRuntime(),
        dryRun: false,
        env: { PATCH_KEYSTORE_PATH: keystorePath },
        logInfo: () => {},
      });
      assert.strictEqual(result.source, "env-path");
      assert.strictEqual(path.normalize(result.keystorePath), path.normalize(keystorePath));
    });
  });

  await runTest("resolveSigningConfig accepts PATCH_KEYSTORE_BASE64 (dry-run)", async () => {
    await withTempDir(async (tmpDir) => {
      const base64 = Buffer.from("dummy-keystore").toString("base64");
      const result = await resolveSigningConfig({
        configDir: tmpDir,
        projectRoot: tmpDir,
        workspaceDir: tmpDir,
        preferWorkspaceKeystore: false,
        signingCfg: {},
        runtime: createRuntime(),
        dryRun: true,
        env: { PATCH_KEYSTORE_BASE64: base64 },
        logInfo: () => {},
      });
      assert.strictEqual(result.source, "env-base64");
      assert.strictEqual(
        path.normalize(result.keystorePath),
        path.normalize(path.join(tmpDir, ".keystore", "morphe-ci.keystore")),
      );
    });
  });

  await runTest("getDefaultWorkspaceRoot supports PATCH_PORTABLE", async () => {
    const portableDir = path.join(os.tmpdir(), "portable-example");
    const resolved = getDefaultWorkspaceRoot({
      PATCH_PORTABLE: "1",
      PORTABLE_EXECUTABLE_DIR: portableDir,
    });
    assert.strictEqual(path.normalize(resolved), path.normalize(path.join(portableDir, "workspace")));
  });

  await runTest("runtime timeout aliases prefer PATCH_* keys", async () => {
    const env = {
      PATCH_PAGE_TIMEOUT_MS: "12000",
      PATCH_DOWNLOAD_TIMEOUT_MS: "1800000",
      PATCH_HTTP_CACHE_TTL_MS: "900000",
    };
    assert.strictEqual(getPageTimeoutMs(env), 12000);
    assert.strictEqual(getDownloadTimeoutMs(env), 1800000);
    assert.strictEqual(getHttpCacheTtlMs(env), 900000);
  });

  await runTest("runtime timeout ignores MORPHE_* keys", async () => {
    const env = {
      MORPHE_PAGE_TIMEOUT_MS: "23456",
      MORPHE_DOWNLOAD_TIMEOUT_MS: "456789",
      MORPHE_HTTP_CACHE_TTL_MS: "34567",
    };
    assert.strictEqual(getPageTimeoutMs(env), 10000);
    assert.strictEqual(getDownloadTimeoutMs(env), 30 * 60 * 1000);
    assert.strictEqual(getHttpCacheTtlMs(env), 15 * 60 * 1000);
  });

  await runTest("runtime timeout warn callback no-op when using ignored MORPHE_* key", async () => {
    const env = { MORPHE_PAGE_TIMEOUT_MS: "11111" };
    let count = 0;
    const warn = () => {
      count += 1;
    };
    assert.strictEqual(getPageTimeoutMs(env, warn), 10000);
    assert.strictEqual(getPageTimeoutMs(env, warn), 10000);
    assert.strictEqual(count, 0);
  });
}

main().catch((error) => {
  process.exitCode = 1;
  throw error;
});
