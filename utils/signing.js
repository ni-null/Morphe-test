"use strict";

const fsp = require("fs").promises;
const path = require("path");

const LOCAL_KEYSTORE_REL = "morphe-test.keystore";
const CI_KEYSTORE_REL = ".keystore/morphe-ci.keystore";

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
  const keystoreBase64 = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_BASE64"]);

  if (keystoreBase64) {
    const keystorePath = path.resolve(configDir, CI_KEYSTORE_REL);
    if (dryRun) {
      logInfo(`DryRun: would write keystore from MORPHE_KEYSTORE_BASE64 to ${keystorePath}`);
    } else {
      await writeKeystoreFromBase64(keystorePath, keystoreBase64, runtime);
      logInfo(`Keystore written from MORPHE_KEYSTORE_BASE64: ${keystorePath}`);
    }
    return {
      keystorePath,
      source: "env-base64",
    };
  }

  const keystorePath = path.resolve(configDir, LOCAL_KEYSTORE_REL);
  const exists = await runtime.fileExists(keystorePath);
  if (!exists) {
    throw new Error(
      `Local test keystore not found: ${keystorePath}. ` +
        "Please add morphe-test.keystore in project root or set MORPHE_KEYSTORE_BASE64.",
    );
  } else {
    logInfo(`Using signing keystore: ${keystorePath}`);
  }

  return {
    keystorePath,
    source: "local-default",
  };
}

module.exports = {
  resolveSigningConfig,
};
