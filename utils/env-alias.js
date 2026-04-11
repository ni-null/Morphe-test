"use strict";

const warnedLegacyEnvPairs = new Set();

function hasValue(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim().length > 0;
}

function resolveEnvWithLegacy(envInput, primaryKey, legacyKeys = []) {
  const env = envInput && typeof envInput === "object" ? envInput : process.env;
  if (hasValue(env[primaryKey])) {
    return {
      value: String(env[primaryKey]).trim(),
      sourceKey: String(primaryKey),
      isLegacy: false,
    };
  }
  for (const legacyKey of Array.isArray(legacyKeys) ? legacyKeys : []) {
    if (!hasValue(env[legacyKey])) continue;
    return {
      value: String(env[legacyKey]).trim(),
      sourceKey: String(legacyKey),
      isLegacy: true,
    };
  }
  return {
    value: "",
    sourceKey: "",
    isLegacy: false,
  };
}

function warnLegacyEnvUsage(resolution, primaryKey, warn) {
  const target = resolution && typeof resolution === "object" ? resolution : {};
  if (!target.isLegacy || !hasValue(target.sourceKey) || !hasValue(primaryKey)) return;

  const pairKey = `${String(target.sourceKey).trim()}=>${String(primaryKey).trim()}`;
  if (warnedLegacyEnvPairs.has(pairKey)) return;
  warnedLegacyEnvPairs.add(pairKey);

  const warnFn = typeof warn === "function" ? warn : (message) => console.warn(message);
  warnFn(`Environment variable "${target.sourceKey}" is deprecated. Please use "${primaryKey}" instead.`);
}

module.exports = {
  resolveEnvWithLegacy,
  warnLegacyEnvUsage,
};
