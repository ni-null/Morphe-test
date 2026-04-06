"use strict";

const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron");
const { registerIpcHandlers } = require("./ipc/handlers");

const APP_CONTENT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar")
  : path.resolve(__dirname, "..");
const WEB_DIST_DIR = path.join(APP_CONTENT_ROOT, "web", "dist");
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const DESKTOP_DEV = String(process.env.DESKTOP_DEV || "") === "1";
const VITE_DEV_URL = process.env.VITE_DEV_URL || "http://127.0.0.1:5173";

let unregisterIpcHandlers = null;

function fileExists(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
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
      preload: PRELOAD_PATH,
      sandbox: false,
    },
  });

  // DevTools shortcuts for desktop UI debugging (browser-like inspect workflow).
  win.webContents.on("before-input-event", (_event, input) => {
    const key = String(input.key || "").toLowerCase();
    const withCmdOrCtrl = !!(input.control || input.meta);
    const withShift = !!input.shift;
    const toggleDevTools = key === "f12" || (withCmdOrCtrl && withShift && key === "i");
    if (!toggleDevTools) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
    } else {
      win.webContents.openDevTools({ mode: "detach" });
    }
  });

  win.webContents.on("context-menu", (_event, params) => {
    const menu = Menu.buildFromTemplate([
      {
        label: "Inspect Element",
        click: () => {
          if (!win.webContents.isDevToolsOpened()) {
            win.webContents.openDevTools({ mode: "detach" });
          }
          win.webContents.inspectElement(params.x, params.y);
        },
      },
    ]);
    menu.popup({ window: win });
  });

  if (DESKTOP_DEV) {
    await win.loadURL(VITE_DEV_URL);
    return;
  }

  await win.loadFile(path.join(WEB_DIST_DIR, "index.html"));
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (typeof unregisterIpcHandlers === "function") {
    unregisterIpcHandlers();
    unregisterIpcHandlers = null;
  }
});

app.whenReady().then(() => {
  unregisterIpcHandlers = registerIpcHandlers(ipcMain, APP_CONTENT_ROOT);
  createMainWindow().catch((err) => {
    dialog.showErrorBox("Desktop Startup Failed", err.message || String(err));
    app.quit();
  });
});
