"use strict";

const chalk = require("chalk");

function highlightMessage(message) {
  let text = String(message);
  text = text.replace(/https?:\/\/[^\s)]+/gu, (m) => chalk.blueBright.underline(m));
  text = text.replace(/\[[^\]\r\n]+\]/gu, (m) => chalk.cyanBright(m));
  text = text.replace(/(?:[A-Za-z]:\\[^\s]+|\.{1,2}[\\/][^\s]+)/gu, (m) => chalk.greenBright(m));
  return text;
}

function logInfo(message) {
  console.log(`${chalk.bgBlue.black(" INFO ")} ${highlightMessage(message)}`);
}

function logWarn(message) {
  console.warn(`${chalk.bgYellow.black(" WARN ")} ${highlightMessage(message)}`);
}

function logStep(message) {
  console.log(`${chalk.bgMagenta.white(" STEP ")} ${highlightMessage(message)}`);
}

function logError(message) {
  console.error(`${chalk.bgRed.white(" ERROR ")} ${highlightMessage(message)}`);
}

module.exports = {
  logInfo,
  logWarn,
  logStep,
  logError,
};
