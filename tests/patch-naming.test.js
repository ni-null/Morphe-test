"use strict";

const assert = require("assert");
const path = require("path");
const {
  extractPatchVersionLabel,
  extractPatchRepoNameFromPath,
  resolvePatchNamingParts,
  buildPatchedApkName,
} = require("../utils/patch-naming");

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("extractPatchVersionLabel handles dev release", () => {
  assert.strictEqual(extractPatchVersionLabel("patches-1.23.0-dev.7.mpp"), "1.23.0-dev.7");
});

runTest("extractPatchVersionLabel handles stable release", () => {
  assert.strictEqual(extractPatchVersionLabel("patches-1.22.0.mpp"), "1.22.0");
});

runTest("extractPatchRepoNameFromPath uses owner@repo folder", () => {
  const patchPath = "C:\\workspace\\patches\\MorpheApp@morphe-patches\\patches-1.22.0.mpp";
  assert.strictEqual(extractPatchRepoNameFromPath(patchPath), "morphe-patches");
});

runTest("extractPatchRepoNameFromPath falls back to local", () => {
  const patchPath = "/tmp/patches/custom/patches-1.22.0.mpp";
  assert.strictEqual(extractPatchRepoNameFromPath(patchPath), "local");
});

runTest("resolvePatchNamingParts returns consistent fields", () => {
  const patchPath = "/workspace/patches/MorpheApp@morphe-patches/patches-1.23.0-dev.7.mpp";
  const naming = resolvePatchNamingParts(patchPath);
  assert.deepStrictEqual(naming, {
    patchFileName: path.basename(patchPath),
    patchRepoName: "morphe-patches",
    patchVersionLabel: "1.23.0-dev.7",
  });
});

runTest("buildPatchedApkName uses new output format", () => {
  const patchPath = "/workspace/patches/MorpheApp@morphe-patches/patches-1.22.0.mpp";
  assert.strictEqual(
    buildPatchedApkName("youtube", "20.12.39", patchPath),
    "youtube-20.12.39-morphe-patches-1.22.0.apk",
  );
});
