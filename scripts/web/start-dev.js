#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..", "..");

function spawnProcess(label, command, args) {
  let child = null;
  try {
    child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });
  } catch (err) {
    throw new Error(`[${label}] spawn failed: ${err.message}`);
  }

  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[${label}] failed to start: ${err.message}`);
  });

  return child;
}

const apiEntry = path.join(projectRoot, "web-api", "server.js");
const api = spawnProcess("web-api", process.execPath, [apiEntry]);

const ui = process.platform === "win32"
  ? spawnProcess("web-ui", process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --prefix web run dev"])
  : spawnProcess("web-ui", "npm", ["--prefix", "./web", "run", "dev"]);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}, shutting down web dev stack...`);

  if (api && !api.killed) api.kill("SIGTERM");
  if (ui && !ui.killed) ui.kill("SIGTERM");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

api.on("exit", (code) => {
  if (!shuttingDown) {
    // eslint-disable-next-line no-console
    console.error(`[web-api] exited with code ${code}`);
    shutdown("web-api-exit");
  }
});

ui.on("exit", (code) => {
  if (!shuttingDown) {
    // eslint-disable-next-line no-console
    console.error(`[web-ui] exited with code ${code}`);
    shutdown("web-ui-exit");
  }
});
