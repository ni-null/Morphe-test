"use strict";

const fsp = require("fs").promises;
const path = require("path");

const LOCAL_KEYSTORE_NAME = "morphe-test.keystore";
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

function resolveConfigKey(config, keys) {
  const target = config && typeof config === "object" ? config : {};
  for (const key of keys) {
    if (hasValue(target[key])) {
      return String(target[key]).trim();
    }
  }
  return "";
}

function resolveSigningCredentialConfig(signingCfg) {
  const storePassword = resolveConfigKey(signingCfg, [
    "store_password",
    "store-password",
    "keystore_password",
    "keystore-password",
  ]);
  const entryAlias = resolveConfigKey(signingCfg, [
    "entry_alias",
    "entry-alias",
    "keystore_entry_alias",
    "keystore-entry-alias",
    "alias",
  ]);
  const entryPassword = resolveConfigKey(signingCfg, [
    "entry_password",
    "entry-password",
    "keystore_entry_password",
    "keystore-entry-password",
    "key_password",
    "key-password",
  ]);
  return {
    storePassword: hasValue(storePassword) ? storePassword : "",
    entryAlias: hasValue(entryAlias) ? entryAlias : "",
    entryPassword: hasValue(entryPassword) ? entryPassword : "",
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

function buildLocalKeystoreCandidates(configDir, projectRoot) {
  const values = [];
  if (hasValue(projectRoot)) {
    values.push(path.resolve(String(projectRoot).trim(), LOCAL_KEYSTORE_NAME));
  }
  values.push(path.resolve(configDir, LOCAL_KEYSTORE_NAME));
  return Array.from(new Set(values));
}

async function resolveSigningConfig(params) {
  const { configDir, projectRoot, workspaceDir, preferWorkspaceKeystore, signingCfg, runtime, dryRun, env, logInfo } = params;
  const effectiveEnv = env || process.env;
  const credentialsFromConfig = resolveSigningCredentialConfig(signingCfg);

  const explicitKeystorePath = resolveEnvKey(effectiveEnv, ["MORPHE_KEYSTORE_PATH"]);
  if (explicitKeystorePath) {
    const resolvedPath = path.isAbsolute(explicitKeystorePath)
      ? path.normalize(explicitKeystorePath)
      : path.resolve(configDir, explicitKeystorePath);
    const exists = await runtime.fileExists(resolvedPath);
    if (!exists) {
      throw new Error(`Selected keystore not found: ${resolvedPath}`);
    }
    logInfo(`Using signing keystore: ${resolvedPath}`);
    return {
      keystorePath: resolvedPath,
      ...credentialsFromConfig,
      source: "env-path",
    };
  }

  const explicitConfigPath = resolveConfigKey(signingCfg, ["keystore_path", "keystore-path", "path"]);
  if (hasValue(explicitConfigPath)) {
    const resolvedPath = path.isAbsolute(explicitConfigPath)
      ? path.normalize(explicitConfigPath)
      : path.resolve(configDir, explicitConfigPath);
    const exists = await runtime.fileExists(resolvedPath);
    if (!exists) {
      throw new Error(`Selected keystore not found: ${resolvedPath}`);
    }
    logInfo(`Using signing keystore: ${resolvedPath}`);
    return {
      keystorePath: resolvedPath,
      ...credentialsFromConfig,
      source: "config",
    };
  }

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
      ...credentialsFromConfig,
      source: "env-base64",
    };
  }

  const shouldUseWorkspaceKeystore = preferWorkspaceKeystore === true && hasValue(workspaceDir);
  if (shouldUseWorkspaceKeystore) {
    const workspaceKeystorePath = path.resolve(String(workspaceDir).trim(), "keystore", LOCAL_KEYSTORE_NAME);
    await runtime.ensureDir(path.dirname(workspaceKeystorePath));
    const workspaceExists = await runtime.fileExists(workspaceKeystorePath);
    if (workspaceExists) {
      logInfo(`Using signing keystore: ${workspaceKeystorePath}`);
      return {
        keystorePath: workspaceKeystorePath,
        ...credentialsFromConfig,
        source: "workspace-default",
      };
    }

    const candidates = buildLocalKeystoreCandidates(configDir, projectRoot).filter(
      (sourcePath) => path.normalize(sourcePath) !== path.normalize(workspaceKeystorePath),
    );
    for (const sourcePath of candidates) {
      const exists = await runtime.fileExists(sourcePath);
      if (!exists) continue;
      if (dryRun) {
        logInfo(`DryRun: would copy keystore ${sourcePath} -> ${workspaceKeystorePath}`);
      } else {
        await fsp.copyFile(sourcePath, workspaceKeystorePath);
        logInfo(`Copied signing keystore: ${sourcePath} -> ${workspaceKeystorePath}`);
      }
      return {
        keystorePath: workspaceKeystorePath,
        ...credentialsFromConfig,
        source: "workspace-copied",
      };
    }

    throw new Error(
      `Workspace keystore not found: ${workspaceKeystorePath}. ` +
        `Please put ${LOCAL_KEYSTORE_NAME} under workspace/keystore or set MORPHE_KEYSTORE_BASE64.`,
    );
  }

  const keystorePath = path.resolve(configDir, LOCAL_KEYSTORE_NAME);
  const exists = await runtime.fileExists(keystorePath);
  if (!exists) {
    throw new Error(
      `Local test keystore not found: ${keystorePath}. ` +
        `Please add ${LOCAL_KEYSTORE_NAME} in config directory or set MORPHE_KEYSTORE_BASE64.`,
    );
  } else {
    logInfo(`Using signing keystore: ${keystorePath}`);
  }

  return {
    keystorePath,
    ...credentialsFromConfig,
    source: "local-default",
  };
}

module.exports = {
  resolveSigningConfig,
};
