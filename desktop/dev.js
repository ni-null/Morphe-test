"use strict";

const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const webApiEntry = path.join(projectRoot, "web-api", "server.js");
const electronBin = require("electron");

function spawnProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || projectRoot,
    stdio: "inherit",
    shell: false,
    env: options.env || process.env,
  });

  child.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error(`[${label}] failed to start: ${err.message}`);
  });

  return child;
}

function spawnNpm(label, scriptArgs, options = {}) {
  if (process.platform === "win32") {
    return spawnProcess(label, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `npm ${scriptArgs.join(" ")}`], options);
  }
  return spawnProcess(label, "npm", scriptArgs, options);
}

const api = spawnProcess("web-api", process.execPath, [webApiEntry], {
  env: {
    ...process.env,
    WEB_API_HOST: "127.0.0.1",
    WEB_API_PORT: "8787",
  },
});

const ui = spawnNpm("web-ui", ["--prefix", "./web", "run", "dev"]);

const desktop = spawnProcess("desktop", electronBin, [path.join(__dirname, "main.js")], {
  env: {
    ...process.env,
    DESKTOP_DEV: "1",
    VITE_DEV_URL: "http://127.0.0.1:5173",
    WEB_API_HOST: "127.0.0.1",
    WEB_API_PORT: "8787",
  },
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\nReceived ${signal}, shutting down desktop dev stack...`);
  if (desktop && !desktop.killed) desktop.kill("SIGTERM");
  if (ui && !ui.killed) ui.kill("SIGTERM");
  if (api && !api.killed) api.kill("SIGTERM");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

for (const [label, child] of [["web-api", api], ["web-ui", ui], ["desktop", desktop]]) {
  child.on("exit", (code) => {
    if (shuttingDown) return;
    // eslint-disable-next-line no-console
    console.error(`[${label}] exited with code ${code}`);
    shutdown(`${label}-exit`);
  });
}
