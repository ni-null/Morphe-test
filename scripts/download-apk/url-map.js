"use strict";

const fs = require("fs");
const path = require("path");

const URL_MAP_PATH = path.join(__dirname, "url.json");

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function readUrlMap() {
  try {
    const raw = fs.readFileSync(URL_MAP_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getProviderUrl(appName, providerName) {
  const map = readUrlMap();
  const appKey = normalizeKey(appName);
  const providerKey = normalizeKey(providerName);
  if (!appKey || !providerKey) {
    return null;
  }

  const appEntry = map[appKey];
  if (!appEntry || typeof appEntry !== "object") {
    return null;
  }
  const value = appEntry[providerKey];
  if (!value || !String(value).trim()) {
    return null;
  }
  return String(value).trim();
}

module.exports = {
  getProviderUrl,
};

