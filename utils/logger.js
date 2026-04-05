"use strict";

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

let logFileStream = null;

function highlightMessage(message) {
  let text = String(message);
  text = text.replace(/https?:\/\/[^\s)]+/gu, (m) => chalk.blueBright.underline(m));
  text = text.replace(/\[[^\]\r\n]+\]/gu, (m) => chalk.cyanBright(m));
  text = text.replace(/(?:[A-Za-z]:\\[^\s]+|\.{1,2}[\\/][^\s]+)/gu, (m) => chalk.greenBright(m));
  return text;
}

function timestamp() {
  return new Date().toISOString();
}

function writeLogFileLine(level, message) {
  if (!logFileStream) return;
  logFileStream.write(`${timestamp()} [${level}] ${String(message)}\n`);
}

function appendLogRaw(text, level = "RAW") {
  if (!logFileStream) return;
  const raw = String(text || "");
  if (!raw) return;
  const normalized = raw.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
  const parts = normalized.split("\n");
  for (let i = 0; i < parts.length; i += 1) {
    const line = parts[i];
    if (!line && i === parts.length - 1) {
      continue;
    }
    writeLogFileLine(level, line);
  }
}

function setLogFilePath(filePath) {
  const targetPath = path.resolve(String(filePath));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (logFileStream) {
    try {
      logFileStream.end();
    } catch {
      // Ignore stream close failure.
    }
  }

  logFileStream = fs.createWriteStream(targetPath, { flags: "a" });
  writeLogFileLine("INFO", `Log file initialized at ${targetPath}`);
}

function closeLogFile() {
  if (!logFileStream) return;
  try {
    writeLogFileLine("INFO", "Log file closed.");
    logFileStream.end();
  } finally {
    logFileStream = null;
  }
}

function logInfo(message) {
  writeLogFileLine("INFO", message);
  console.log(`${chalk.bgBlue.black(" INFO ")} ${highlightMessage(message)}`);
}

function logWarn(message) {
  writeLogFileLine("WARN", message);
  console.warn(`${chalk.bgYellow.black(" WARN ")} ${highlightMessage(message)}`);
}

function logStep(message) {
  writeLogFileLine("STEP", message);
  console.log(`${chalk.bgMagenta.white(" STEP ")} ${highlightMessage(message)}`);
}

function logError(message) {
  writeLogFileLine("ERROR", message);
  console.error(`${chalk.bgRed.white(" ERROR ")} ${highlightMessage(message)}`);
}

module.exports = {
  setLogFilePath,
  closeLogFile,
  appendLogRaw,
  logInfo,
  logWarn,
  logStep,
  logError,
};
