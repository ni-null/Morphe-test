"use strict";

const fsp = require("fs").promises;

function stripInlineComment(rawValue) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < rawValue.length; i += 1) {
    const ch = rawValue[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inDouble) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "#" && !inSingle && !inDouble) {
      return rawValue.slice(0, i).trim();
    }
  }

  return rawValue.trim();
}

function parseTomlScalar(rawValue) {
  const value = rawValue.trim();
  if (/^\[.*\]$/u.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => {
        if (item.startsWith('"') && item.endsWith('"') && item.length >= 2) {
          const unquoted = item.slice(1, -1);
          let output = "";
          for (let i = 0; i < unquoted.length; i += 1) {
            const ch = unquoted[i];
            if (ch !== "\\") {
              output += ch;
              continue;
            }
            const next = unquoted[i + 1];
            if (!next) {
              output += "\\";
              break;
            }
            i += 1;
            if (next === "n") {
              output += "\n";
              continue;
            }
            if (next === "r") {
              output += "\r";
              continue;
            }
            if (next === "t") {
              output += "\t";
              continue;
            }
            if (next === '"') {
              output += '"';
              continue;
            }
            if (next === "\\") {
              output += "\\";
              continue;
            }
            output += next;
          }
          return output;
        }
        return item;
      });
  }
  if (/^".*"$/.test(value)) {
    const inner = value.slice(1, -1);
    let output = "";
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (ch !== "\\") {
        output += ch;
        continue;
      }
      const next = inner[i + 1];
      if (!next) {
        output += "\\";
        break;
      }
      i += 1;
      if (next === "n") {
        output += "\n";
        continue;
      }
      if (next === "r") {
        output += "\r";
        continue;
      }
      if (next === "t") {
        output += "\t";
        continue;
      }
      if (next === '"') {
        output += '"';
        continue;
      }
      if (next === "\\") {
        output += "\\";
        continue;
      }
      output += next;
    }
    return output;
  }
  if (/^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }
  if (/^(true|false)$/i.test(value)) {
    return /^true$/i.test(value);
  }
  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value);
  }
  return value;
}

function parseSimpleToml(tomlContent) {
  const config = {};
  const lines = tomlContent.split(/\r?\n/u);
  let currentSection = null;

  lines.forEach((rawLine, idx) => {
    const lineNumber = idx + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return;
    }

    const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/u);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!Object.prototype.hasOwnProperty.call(config, currentSection)) {
        config[currentSection] = {};
      }
      return;
    }

    const kvMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/u);
    if (kvMatch) {
      if (!currentSection) {
        throw new Error(`TOML parse error at line ${lineNumber}: key-value must be inside a [section].`);
      }
      config[currentSection][kvMatch[1]] = parseTomlScalar(stripInlineComment(kvMatch[2]));
      return;
    }

    throw new Error(`TOML parse error at line ${lineNumber}: ${line}`);
  });

  return config;
}

async function readTomlFile(filePath, fileExists) {
  if (!(await fileExists(filePath))) {
    throw new Error(`TOML file not found: ${filePath}`);
  }
  const content = await fsp.readFile(filePath, "utf8");
  return parseSimpleToml(content);
}

module.exports = {
  readTomlFile,
};
