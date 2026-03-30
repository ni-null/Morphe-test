"use strict";

const { URL } = require("url");

function toAbsoluteUrl(baseUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl || !String(maybeRelativeUrl).trim()) return maybeRelativeUrl;
  if (/^https?:\/\//iu.test(maybeRelativeUrl)) return maybeRelativeUrl;
  return new URL(maybeRelativeUrl, baseUrl).toString();
}

function getHrefMatches(html, pattern) {
  const results = [];
  const regex = new RegExp(pattern, "giu");
  let match = regex.exec(html);
  while (match) {
    if (match[1] && String(match[1]).trim()) {
      results.push(match[1]);
    }
    match = regex.exec(html);
  }
  return results;
}

function selectBestByVersion(candidates, versionHint) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (versionHint !== undefined && versionHint !== null && String(versionHint).trim().length > 0) {
    const normalized = String(versionHint).toLowerCase();
    const normalizedDash = normalized.replace(/\./gu, "-");
    const hit = candidates.find((item) => {
      const value = String(item).toLowerCase();
      return value.includes(normalized) || value.includes(normalizedDash);
    });
    if (hit) return hit;
  }
  return candidates[0];
}

module.exports = {
  toAbsoluteUrl,
  getHrefMatches,
  selectBestByVersion,
};
