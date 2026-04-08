"use strict";

const path = require("path");
const { safeFileName } = require("./common");

function normalizeText(value) {
  return String(value || "").trim();
}

function extractPatchVersionLabel(fileName) {
  const baseName = normalizeText(path.basename(String(fileName || ""), path.extname(String(fileName || ""))));
  if (!baseName) return "unknown";
  const matched = baseName.match(/^patches-(.+)$/iu);
  const label = matched && matched[1] ? normalizeText(matched[1]) : baseName;
  return safeFileName(label || "unknown");
}

function extractPatchRepoNameFromPath(patchPath) {
  const normalized = normalizeText(patchPath).replace(/\\/gu, "/");
  if (!normalized) return "local";
  const parts = normalized.split("/").filter(Boolean);
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const segment = normalizeText(parts[index]);
    if (!segment.includes("@")) continue;
    const repoName = normalizeText(segment.split("@").pop());
    if (repoName) return safeFileName(repoName);
  }
  return "local";
}

function resolvePatchNamingParts(patchPath) {
  const patchFileName = path.basename(String(patchPath || ""));
  return {
    patchFileName,
    patchRepoName: extractPatchRepoNameFromPath(patchPath),
    patchVersionLabel: extractPatchVersionLabel(patchFileName),
  };
}

function buildPatchedApkName(appName, apkVersion, patchPath) {
  const appLabel = safeFileName(normalizeText(appName) || "app");
  const versionLabel = safeFileName(normalizeText(apkVersion) || "unknown");
  const patchNaming = resolvePatchNamingParts(patchPath);
  return `${appLabel}-${versionLabel}-${patchNaming.patchRepoName}-${patchNaming.patchVersionLabel}.apk`;
}

module.exports = {
  extractPatchVersionLabel,
  extractPatchRepoNameFromPath,
  resolvePatchNamingParts,
  buildPatchedApkName,
};
