"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const IPC_CHANNEL = "morphe:invoke";

contextBridge.exposeInMainWorld("morpheDesktop", {
  invoke(method, payload) {
    return ipcRenderer.invoke(IPC_CHANNEL, { method, payload });
  },
});
