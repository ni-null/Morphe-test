function getDesktopBridge() {
  const bridge = window.morpheDesktop
  if (!bridge || typeof bridge.invoke !== "function") {
    throw new Error("Desktop IPC bridge unavailable. Please launch via Electron desktop app.")
  }
  return bridge
}

async function requestIpc(method, payload = {}) {
  const bridge = getDesktopBridge()
  return bridge.invoke(method, payload)
}

export async function fetchConfig(configPath = "config.toml") {
  return requestIpc("fetchConfig", { configPath })
}

export async function fetchPackageMap() {
  return requestIpc("fetchPackageMap")
}

export async function checkJavaVersion() {
  return requestIpc("checkJavaVersion")
}

export async function saveConfig({ path, content }) {
  return requestIpc("saveConfig", { path, content })
}

export async function listTasks(limit = 50) {
  return requestIpc("listTasks", { limit })
}

export async function startTask(options) {
  return requestIpc("startTask", options || {})
}

export async function fetchAppTemplates(configPath) {
  return requestIpc("fetchAppTemplates", {
    configPath: String(configPath || "config.toml"),
  })
}

export async function fetchTask(taskId) {
  return requestIpc("fetchTask", { taskId: String(taskId || "") })
}

export async function deleteTask(taskId) {
  return requestIpc("deleteTask", { taskId: String(taskId || "") })
}

export async function deleteAllTasks() {
  return requestIpc("deleteAllTasks")
}

export async function clearAllCache() {
  return requestIpc("clearAllCache")
}

export async function stopTask(taskId) {
  return requestIpc("stopTask", { taskId: String(taskId || "") })
}

export async function fetchTaskLog(taskId, tail = 300) {
  return requestIpc("fetchTaskLog", {
    taskId: String(taskId || ""),
    tail,
  })
}

export async function fetchTaskArtifacts(taskId) {
  return requestIpc("fetchTaskArtifacts", { taskId: String(taskId || "") })
}

export async function openTaskOutputDir(taskId) {
  return requestIpc("openTaskOutputDir", { taskId: String(taskId || "") })
}

export async function openTaskArtifactDir(taskId, relativePath) {
  return requestIpc("openTaskArtifactDir", {
    taskId: String(taskId || ""),
    relativePath: String(relativePath || ""),
  })
}

export async function fetchAppCompatibleVersions(configPath, app) {
  return requestIpc("fetchAppCompatibleVersions", {
    configPath: String(configPath || "config.toml"),
    app: app && typeof app === "object" ? app : {},
  })
}

export async function fetchAppPatchOptions(configPath, app) {
  const safeConfigPath = String(configPath || "config.toml")
  const safeApp = app && typeof app === "object" ? app : {}
  try {
    return await requestIpc("fetchAppPatchOptions", {
      configPath: safeConfigPath,
      app: safeApp,
    })
  } catch (error) {
    const text = String(error?.message || error || "")
    if (!text.includes("Unknown IPC method: fetchAppPatchOptions")) {
      throw error
    }
    throw new Error("Desktop 主程式版本過舊，請完全重啟桌面端（含 Electron 主程序）後再查詢補丁。")
  }
}

export async function listSourceFiles(type) {
  return requestIpc("listSourceFiles", { type: String(type || "") })
}

export async function fetchAndSaveSource(options) {
  return requestIpc("fetchAndSaveSource", options || {})
}

export async function fetchSourceVersions(options) {
  return requestIpc("fetchSourceVersions", options || {})
}

export async function listDownloadedApks() {
  try {
    return await requestIpc("listDownloadedApks")
  } catch (error) {
    const text = String(error?.message || error || "")
    if (!text.includes("Unknown IPC method: listDownloadedApks")) {
      throw error
    }
    throw new Error("Desktop 主程式版本過舊，請完全重啟桌面端（含 Electron 主程序）後再試。")
  }
}

export async function deleteDownloadedApk(fullPath) {
  return requestIpc("deleteDownloadedApk", { fullPath: String(fullPath || "") })
}

export async function openAssetsDir(kind) {
  return requestIpc("openAssetsDir", { kind: String(kind || "") })
}

export async function browseLocalApkPath(defaultPath = "") {
  return requestIpc("browseLocalApkPath", { defaultPath: String(defaultPath || "") })
}

export async function deleteSourceFile(type, relativePath) {
  return requestIpc("deleteSourceFile", {
    type: String(type || ""),
    relativePath: String(relativePath || ""),
  })
}
