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
  if (/^".*"$/.test(value)) {
    const inner = value.slice(1, -1);
    return inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
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
