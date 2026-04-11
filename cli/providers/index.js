"use strict";

const engineProvider = require("./engine-provider");
const stubProvider = require("./stub");

const REQUIRED_PROVIDER_KEYS = [
  "id",
  "resolveCliJar",
  "resolvePatchFile",
  "listPatchEntries",
  "listCompatibleVersionsRaw",
  "listPatchEntriesRaw",
  "resolveVersionCandidates",
  "resolveCompatibleVersionsFromRaw",
  "parsePatchEntries",
  "mergePatchEntries",
  "runPatchCommand",
];

const PROVIDERS = new Map([
  ["engine", engineProvider],
  ["stub", stubProvider],
]);

function normalizeProviderId(value) {
  const id = String(value || "engine").trim().toLowerCase();
  return id || "engine";
}

function assertPatchProviderShape(provider, providerId) {
  if (!provider || typeof provider !== "object") {
    throw new Error(`Invalid patch provider [${providerId}]: provider must be an object.`);
  }
  for (const key of REQUIRED_PROVIDER_KEYS) {
    if (!(key in provider)) {
      throw new Error(`Invalid patch provider [${providerId}]: missing key "${key}".`);
    }
  }
  if (typeof provider.id !== "string" || !provider.id.trim()) {
    throw new Error(`Invalid patch provider [${providerId}]: id must be a non-empty string.`);
  }
  for (const methodName of REQUIRED_PROVIDER_KEYS.slice(1)) {
    if (typeof provider[methodName] !== "function") {
      throw new Error(`Invalid patch provider [${providerId}]: "${methodName}" must be a function.`);
    }
  }
}

for (const [providerId, provider] of PROVIDERS.entries()) {
  assertPatchProviderShape(provider, providerId);
}

function resolvePatchProviderIdFromEnv(env, options = {}) {
  const source = env && typeof env === "object" ? env : process.env;
  void options;
  return normalizeProviderId(source.PATCH_PROVIDER || "engine");
}

function getPatchProvider(value) {
  const id = normalizeProviderId(value);
  const provider = PROVIDERS.get(id);
  if (provider) return provider;
  const supported = Array.from(PROVIDERS.keys()).join(", ");
  throw new Error(`Unsupported patch provider: ${value}. Supported providers: ${supported}`);
}

function listPatchProviderIds() {
  return Array.from(PROVIDERS.keys());
}

module.exports = {
  getPatchProvider,
  listPatchProviderIds,
  normalizeProviderId,
  resolvePatchProviderIdFromEnv,
};
