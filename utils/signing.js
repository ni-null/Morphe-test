"use strict";

const fsp = require("fs").promises;
const path = require("path");

const DEFAULT_KEYSTORE_REL = "morphe-test.keystore";

function hasValue(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function resolveEnvKey(env, keys) {
  for (const key of keys) {
    if (hasValue(env[key])) {
      return String(env[key]).trim();
    }
  }
  return null;
}

function resolveKeystorePath(configDir, env) {
  const explicit = resolveEnvKey(env, ["MORPHE_KEYSTORE_PATH"]);
  if (explicit) {
    return { path: path.isAbsolute(explicit) ? path.normalize(explicit) : path.resolve(configDir, explicit), explicit: true };
  }
  return {
    path: path.resolve(configDir, DEFAULT_KEYSTORE_REL),
    explicit: false,
  };
}

async function writeKeystoreFromBase64(keystorePath, base64Data, runtime) {
  const normalized = String(base64Data).replace(/\s+/gu, "");
  let decoded = null;
  try {
    decoded = Buffer.from(normalized, "base64");
  } catch {
    throw new Error("MORPHE_KEYSTORE_BASE64 is not valid base64.");
  }
  if (!decoded || decoded.length === 0) {
    throw new Error("MORPHE_KEYSTORE_BASE64 decoded to empty content.");
  }
  await runtime.ensureDir(path.dirname(keystorePath));
  await fsp.writeFile(keystorePath, decoded);
}

async function resolveSigningConfig(params) {
  const { configDir, runtime, dryRun, env, logInfo } = params;
  const effectiveEnv = env || process.env;

  const storePassword = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_PASSWORD"]);
  const entryAlias = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_ENTRY_ALIAS", "MORPHE_KEY_ALIAS"]);
  const entryPassword = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_ENTRY_PASSWORD", "MORPHE_KEY_ALIAS_PASSWORD"]);

  const resolvedPath = resolveKeystorePath(configDir, effectiveEnv);
  const keystorePath = resolvedPath.path;
  const keystoreBase64 = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_BASE64"]);

  if (keystoreBase64) {
    if (dryRun) {
      logInfo(`DryRun: would write keystore from MORPHE_KEYSTORE_BASE64 to ${keystorePath}`);
    } else {
      await writeKeystoreFromBase64(keystorePath, keystoreBase64, runtime);
      logInfo(`Keystore written from MORPHE_KEYSTORE_BASE64: ${keystorePath}`);
    }
    return {
      keystorePath,
      storePassword,
      entryAlias,
      entryPassword,
      source: "env-base64",
    };
  }

  const exists = await runtime.fileExists(keystorePath);
  if (!exists) {
    if (resolvedPath.explicit) {
      if (dryRun) {
        logInfo(`DryRun: explicit keystore path not found yet: ${keystorePath}`);
      } else {
        throw new Error(`MORPHE_KEYSTORE_PATH does not exist: ${keystorePath}`);
      }
    } else {
      throw new Error(
        `Local test keystore not found: ${keystorePath}. ` +
          "Please add morphe-test.keystore in project root or set MORPHE_KEYSTORE_BASE64 / MORPHE_KEYSTORE_PATH.",
      );
    }
  } else {
    logInfo(`Using signing keystore: ${keystorePath}`);
  }

  return {
    keystorePath,
    storePassword,
    entryAlias,
    entryPassword,
    source: resolvedPath.explicit ? "env-path" : "local-default",
  };
}

module.exports = {
  resolveSigningConfig,
};
