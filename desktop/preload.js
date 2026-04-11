"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNEL } = require("./ipc/constants");

contextBridge.exposeInMainWorld("patcherDesktop", {
  invoke(method, payload) {
    return ipcRenderer.invoke(IPC_CHANNEL, { method, payload });
  },
});
