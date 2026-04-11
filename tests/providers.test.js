"use strict";

const assert = require("assert");
const {
  getPatchProvider,
  listPatchProviderIds,
  normalizeProviderId,
  resolvePatchProviderIdFromEnv,
} = require("../cli/providers");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("provider registry includes engine and stub", () => {
  const ids = listPatchProviderIds();
  assert.ok(Array.isArray(ids));
  assert.ok(ids.includes("engine"));
  assert.ok(ids.includes("stub"));
});

runTest("getPatchProvider resolves engine/stub and returns id", () => {
  assert.strictEqual(getPatchProvider("engine").id, "engine");
  assert.strictEqual(getPatchProvider("stub").id, "stub");
});

runTest("normalizeProviderId defaults to engine", () => {
  assert.strictEqual(normalizeProviderId(""), "engine");
  assert.strictEqual(normalizeProviderId(null), "engine");
  assert.strictEqual(normalizeProviderId(undefined), "engine");
});

runTest("resolvePatchProviderIdFromEnv uses PATCH_PROVIDER", () => {
  const env = { PATCH_PROVIDER: "stub" };
  assert.strictEqual(resolvePatchProviderIdFromEnv(env), "stub");
});

runTest("resolvePatchProviderIdFromEnv defaults to engine when PATCH_PROVIDER is missing", () => {
  const env = {};
  assert.strictEqual(resolvePatchProviderIdFromEnv(env), "engine");
});

runTest("getPatchProvider throws for unsupported provider", () => {
  assert.throws(() => getPatchProvider("unknown-provider"), /Unsupported patch provider/u);
});
