"use strict";

const path = require("path");

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function pickFirstValue(table, keys) {
  for (const key of keys) {
    if (hasValue(table[key])) return String(table[key]);
  }
  return null;
}

function assertRequiredField(table, fieldName, contextName) {
  if (!table || !hasValue(table[fieldName])) {
    throw new Error(`[${contextName}] missing required field: ${fieldName}`);
  }
}

function resolveAbsolutePath(pathValue, baseDir) {
  if (!pathValue || !String(pathValue).trim()) {
    throw new Error("Path value is empty.");
  }
  if (path.isAbsolute(pathValue)) {
    return path.normalize(pathValue);
  }
  return path.resolve(baseDir, pathValue);
}

function safeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1F]/gu, "_");
}

function formatError(err) {
  return err && err.message ? err.message : String(err);
}

module.exports = {
  hasValue,
  pickFirstValue,
  assertRequiredField,
  resolveAbsolutePath,
  safeFileName,
  formatError,
};
