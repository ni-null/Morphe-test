"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog } = require("electron");

const APP_CONTENT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar")
  : path.resolve(__dirname, "..");
const API_ENTRY = path.join(APP_CONTENT_ROOT, "web-api", "server.js");
const WEB_DIST_DIR = path.join(APP_CONTENT_ROOT, "web", "dist");
const API_CWD = app.isPackaged ? process.resourcesPath : APP_CONTENT_ROOT;
const API_HOST = process.env.WEB_API_HOST || "127.0.0.1";
const API_PORT = Number.parseInt(process.env.WEB_API_PORT || "8787", 10);
const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;
const DESKTOP_DEV = String(process.env.DESKTOP_DEV || "") === "1";
const VITE_DEV_URL = process.env.VITE_DEV_URL || "http://127.0.0.1:5173";

let apiProcess = null;

function fileExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function terminateProcessTree(child) {
  if (!child || child.killed || !child.pid) {
    return;
  }

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        shell: false,
      });
      return;
    } catch {
      // Fallback below.
    }
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

function startApiServer() {
  if (!fileExists(API_ENTRY)) {
    throw new Error(`web-api entry not found: ${API_ENTRY}`);
  }
  apiProcess = spawn(process.execPath, [API_ENTRY], {
    cwd: API_CWD,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      WEB_API_HOST: API_HOST,
      WEB_API_PORT: String(API_PORT),
      WEB_STATIC_DIR: WEB_DIST_DIR,
    },
  });

  apiProcess.on("exit", (code) => {
    if (code !== 0) {
      dialog.showErrorBox("Web API Exited", `web-api process exited with code ${code}`);
    }
  });

  apiProcess.on("error", (err) => {
    dialog.showErrorBox("Web API Failed", `Failed to start web-api: ${err.message}`);
  });
}

function waitForApiReady(timeoutMs = 20000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function probe() {
      const req = http.get(`${API_BASE_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`web-api health check timeout (status=${res.statusCode})`));
          return;
        }
        setTimeout(probe, 300);
      });

      req.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("web-api health check timeout"));
          return;
        }
        setTimeout(probe, 300);
      });
    }

    probe();
  });
}

async function createMainWindow() {
  if (!DESKTOP_DEV) {
    if (!fileExists(path.join(WEB_DIST_DIR, "index.html"))) {
      dialog.showErrorBox(
        "Missing UI Build",
        "web/dist not found. Run `npm run web:build` before launching Electron.",
      );
      app.quit();
      return;
    }
    if (!fileExists(API_ENTRY)) {
      dialog.showErrorBox(
        "Missing Web API Entry",
        `web-api/server.js not found at:\n${API_ENTRY}`,
      );
      app.quit();
      return;
    }

    startApiServer();
    await waitForApiReady();
  }

  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadURL(DESKTOP_DEV ? VITE_DEV_URL : API_BASE_URL);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  terminateProcessTree(apiProcess);
});

app.whenReady().then(() => {
  createMainWindow().catch((err) => {
    dialog.showErrorBox("Desktop Startup Failed", err.message || String(err));
    app.quit();
  });
});
