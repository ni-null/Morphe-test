import { uiDownloadManager } from "./uiDownloadManager"

function getDesktopBridge() {
  const bridge = window.patcherDesktop
  if (!bridge || typeof bridge.invoke !== "function") {
    throw new Error("Desktop IPC bridge unavailable. Please launch via Electron desktop app.")
  }
  return bridge
}

function normalizeIpcError(error) {
  const raw = String(error?.message || error || "").trim()
  const text = raw.replace(/^Error invoking remote method '[^']+':\s*/u, "")

  const missingLocalPatchMatch = text.match(/^\[([^\]]+)\]\s+Local patch file not found:\s*(.+)$/iu)
  if (missingLocalPatchMatch) {
    const appName = String(missingLocalPatchMatch[1] || "").trim()
    const localPath = String(missingLocalPatchMatch[2] || "").trim()
    return new Error(
      `[${appName}] 找不到自訂本地 patches 檔案：${localPath}\n請重新選擇本地 patches，或切回 stable/dev。`,
    )
  }

  return new Error(text || "Unknown IPC error")
}

async function requestIpc(method, payload = {}) {
  const bridge = getDesktopBridge()
  try {
    return await bridge.invoke(method, payload)
  } catch (error) {
    throw normalizeIpcError(error)
  }
}

export async function fetchConfig(configPath = "") {
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
  const safeConfigPath = String(configPath || "")
  const safeApp = app && typeof app === "object" ? app : {}
  const packageName = String(safeApp.packageName || "").trim()
  const methodKey = uiDownloadManager.makeInflightKey([
    "app-compat",
    safeConfigPath,
    packageName,
  ])
  const lockKey = uiDownloadManager.makeInflightKey([
    "app-resource",
    safeConfigPath,
    packageName,
  ])
  return uiDownloadManager.runSerial(lockKey, () =>
    uiDownloadManager.runSingleflight(methodKey, () =>
      requestIpc("fetchAppCompatibleVersions", {
        configPath: safeConfigPath,
        app: safeApp,
      }),
    ),
  )
}

export async function fetchEngineCompatibleVersions(configPath, app) {
  const safeConfigPath = String(configPath || "")
  const safeApp = app && typeof app === "object" ? app : {}
  const packageName = String(safeApp.packageName || "").trim()
  const methodKey = uiDownloadManager.makeInflightKey([
    "engine-compat",
    safeConfigPath,
    packageName,
  ])
  const lockKey = uiDownloadManager.makeInflightKey([
    "app-resource",
    safeConfigPath,
    packageName,
  ])
  return uiDownloadManager.runSerial(lockKey, () =>
    uiDownloadManager.runSingleflight(methodKey, () =>
      requestIpc("fetchEngineCompatibleVersions", {
        configPath: safeConfigPath,
        app: safeApp,
      }),
    ),
  )
}

export async function fetchAppPatchOptions(configPath, app) {
  const safeConfigPath = String(configPath || "")
  const safeApp = app && typeof app === "object" ? app : {}
  const packageName = String(safeApp.packageName || "").trim()
  const methodKey = uiDownloadManager.makeInflightKey([
    "app-patches",
    safeConfigPath,
    packageName,
  ])
  const lockKey = uiDownloadManager.makeInflightKey([
    "app-resource",
    safeConfigPath,
    packageName,
  ])
  try {
    return await uiDownloadManager.runSerial(lockKey, () =>
      uiDownloadManager.runSingleflight(methodKey, () =>
        requestIpc("fetchAppPatchOptions", {
          configPath: safeConfigPath,
          app: safeApp,
        }),
      ),
    )
  } catch (error) {
    const text = String(error?.message || error || "")
    if (!text.includes("Unknown IPC method: fetchAppPatchOptions")) {
      throw error
    }
    throw new Error("Desktop 主程式版本過舊，請完全重啟桌面端（含 Electron 主程序）後再查詢補丁。")
  }
}

export async function fetchEnginePatchOptions(configPath, app) {
  const safeConfigPath = String(configPath || "")
  const safeApp = app && typeof app === "object" ? app : {}
  const packageName = String(safeApp.packageName || "").trim()
  const methodKey = uiDownloadManager.makeInflightKey([
    "engine-patches",
    safeConfigPath,
    packageName,
  ])
  const lockKey = uiDownloadManager.makeInflightKey([
    "app-resource",
    safeConfigPath,
    packageName,
  ])
  try {
    return await uiDownloadManager.runSerial(lockKey, () =>
      uiDownloadManager.runSingleflight(methodKey, () =>
        requestIpc("fetchEnginePatchOptions", {
          configPath: safeConfigPath,
          app: safeApp,
        }),
      ),
    )
  } catch (error) {
    const text = String(error?.message || error || "")
    if (!text.includes("Unknown IPC method: fetchEnginePatchOptions")) {
      throw error
    }
    throw new Error("Desktop 主程式版本過舊，請完全重啟桌面端（含 Electron 主程序）後再查詢補丁。")
  }
}

export async function listSourceFiles(type) {
  return requestIpc("listSourceFiles", { type: String(type || "") })
}

export async function listArtifactSourceFiles(type) {
  return requestIpc("listArtifactSourceFiles", { type: String(type || "") })
}

export async function fetchAndSaveSource(options) {
  const safeOptions = options && typeof options === "object" ? options : {}
  const inflightKey = uiDownloadManager.makeInflightKey([
    "source-download",
    String(safeOptions.type || ""),
    String(safeOptions.mode || ""),
    String(safeOptions.repo || ""),
    String(safeOptions.patchesRepo || ""),
    String(safeOptions.version || ""),
  ])
  return uiDownloadManager.runSingleflight(inflightKey, () =>
    requestIpc("fetchAndSaveSource", safeOptions),
  )
}

export async function fetchAndSaveArtifactSource(options) {
  const safeOptions = options && typeof options === "object" ? options : {}
  const inflightKey = uiDownloadManager.makeInflightKey([
    "artifact-source-download",
    String(safeOptions.type || ""),
    String(safeOptions.mode || ""),
    String(safeOptions.repo || ""),
    String(safeOptions.patchesRepo || ""),
    String(safeOptions.version || ""),
  ])
  return uiDownloadManager.runSingleflight(inflightKey, () =>
    requestIpc("fetchAndSaveArtifactSource", safeOptions),
  )
}

export async function fetchSourceVersions(options) {
  return requestIpc("fetchSourceVersions", options || {})
}

export async function fetchArtifactSourceVersions(options) {
  return requestIpc("fetchArtifactSourceVersions", options || {})
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

export async function openArtifactSourceDir(kind) {
  return requestIpc("openArtifactSourceDir", { kind: String(kind || "") })
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

export async function deleteArtifactSourceFile(type, relativePath) {
  return requestIpc("deleteArtifactSourceFile", {
    type: String(type || ""),
    relativePath: String(relativePath || ""),
  })
}

export async function openSourceFile(type, relativePath) {
  return requestIpc("openSourceFile", {
    type: String(type || ""),
    relativePath: String(relativePath || ""),
  })
}

export async function openArtifactSourceFile(type, relativePath) {
  return requestIpc("openArtifactSourceFile", {
    type: String(type || ""),
    relativePath: String(relativePath || ""),
  })
}
