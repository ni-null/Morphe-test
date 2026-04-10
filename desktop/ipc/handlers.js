"use strict";

const fsp = require("fs").promises;
const path = require("path");
const { BrowserWindow, dialog, shell } = require("electron");
const fs = require("fs");
const { TaskService } = require("./task-service");
const { IPC_CHANNEL } = require("./constants");

function normalizeBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function createInvokeHandler(projectRoot) {
  const taskService = new TaskService(projectRoot);

  return async function onInvoke(_event, request) {
    const method = String(request && request.method ? request.method : "").trim();
    const payload = request && typeof request.payload === "object" && request.payload
      ? request.payload
      : {};

    if (!method) {
      throw new Error("IPC method is required.");
    }

    if (method === "fetchConfig") {
      const configPath = taskService.resolveConfigPath(payload.configPath);
      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      if (!fs.existsSync(configPath)) {
        await fsp.writeFile(configPath, "", "utf8");
      }
      const content = await fsp.readFile(configPath, "utf8");
      return { path: configPath, content };
    }

    if (method === "fetchPackageMap") {
      return { map: taskService.getPackageMetaMap() };
    }

    if (method === "checkJavaVersion") {
      return await taskService.checkJavaVersion();
    }

    if (method === "saveConfig") {
      const configPath = taskService.resolveConfigPath(payload.path);
      const content = String(payload.content || "");
      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      await fsp.writeFile(configPath, content, "utf8");
      return { path: configPath, saved: true };
    }

    if (method === "listTasks") {
      const limit = Number.parseInt(String(payload.limit || "50"), 10);
      return { tasks: await taskService.listTasks(Number.isFinite(limit) ? limit : 50) };
    }

    if (method === "startTask") {
      const persistLogs = Object.prototype.hasOwnProperty.call(payload, "persistLogs")
        ? normalizeBoolean(payload.persistLogs)
        : true;
      const task = taskService.startTask({
        configPath: payload.configPath,
        workspacePath: payload.workspacePath,
        migrateWorkspace: normalizeBoolean(payload.migrateWorkspace),
        force: normalizeBoolean(payload.force),
        dryRun: normalizeBoolean(payload.dryRun),
        downloadOnly: normalizeBoolean(payload.downloadOnly),
        patchesOnly: normalizeBoolean(payload.patchesOnly),
        morpheCliOnly: normalizeBoolean(payload.morpheCliOnly),
        persistLogs,
      });
      return { task };
    }

    if (method === "fetchTask") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      const task = await taskService.getTask(taskId);
      return {
        task: task || null,
        notFound: !task,
      };
    }

    if (method === "deleteTask") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      return await taskService.deleteTask(taskId);
    }

    if (method === "deleteAllTasks") {
      return await taskService.deleteAllTasks();
    }

    if (method === "clearAllCache") {
      return await taskService.clearAllCache();
    }

    if (method === "stopTask") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      const task = taskService.stopTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      return { task };
    }

    if (method === "fetchTaskLog") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      const tail = Number.parseInt(String(payload.tail || "300"), 10);
      const data = await taskService.getTaskLog(taskId, tail);
      if (!data) {
        return {
          source: "none",
          logPath: null,
          content: "",
          notFound: true,
        };
      }
      return {
        ...data,
        notFound: false,
      };
    }

    if (method === "fetchTaskArtifacts") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      return await taskService.getTaskArtifacts(taskId);
    }

    if (method === "openTaskOutputDir") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      return await taskService.openTaskOutputDir(taskId);
    }

    if (method === "openTaskArtifactDir") {
      const taskId = String(payload.taskId || "");
      if (!taskId) throw new Error("taskId is required.");
      return await taskService.openTaskArtifactDir(taskId, payload.relativePath);
    }

    if (method === "fetchAppCompatibleVersions") {
      return await taskService.getAppCompatibleVersions({
        configPath: payload.configPath,
        app: payload.app && typeof payload.app === "object" ? payload.app : {},
      });
    }

    if (method === "fetchAppPatchOptions") {
      return await taskService.getAppPatchEntries({
        configPath: payload.configPath,
        app: payload.app && typeof payload.app === "object" ? payload.app : {},
      });
    }

    if (method === "listSourceFiles") {
      return await taskService.listSourceFiles(payload.type);
    }

    if (method === "fetchAndSaveSource") {
      return await taskService.fetchAndSaveSource({
        type: payload.type,
        mode: payload.mode,
        repo: payload.repo,
        patchesRepo: payload.patchesRepo,
        version: payload.version,
        force: normalizeBoolean(payload.force),
      });
    }

    if (method === "fetchSourceVersions") {
      return await taskService.listSourceRepoVersions({
        type: payload.type,
        repo: payload.repo,
      });
    }

    if (method === "listDownloadedApks") {
      return await taskService.listDownloadedApks();
    }

    if (method === "deleteDownloadedApk") {
      return await taskService.deleteDownloadedApk({
        fullPath: payload.fullPath,
      });
    }

    if (method === "openAssetsDir") {
      return await taskService.openAssetsDir(payload.kind);
    }

    if (method === "browseLocalApkPath") {
      const owner = BrowserWindow.fromWebContents(_event.sender) || null;
      const result = await dialog.showOpenDialog(owner, {
        title: "Select local APK file",
        defaultPath: String(payload.defaultPath || ""),
        properties: ["openFile"],
        filters: [{ name: "APK", extensions: ["apk"] }],
      });
      return {
        canceled: !!result.canceled,
        path: result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0
          ? ""
          : String(result.filePaths[0]),
      };
    }

    if (method === "deleteSourceFile") {
      return await taskService.deleteSourceFile({
        type: payload.type,
        fileName: payload.fileName,
        relativePath: payload.relativePath,
      });
    }

    if (method === "openSourceFile") {
      return await taskService.openSourceFile(
        {
          type: payload.type,
          relativePath: payload.relativePath,
        },
        async (targetPath) => shell.openPath(targetPath),
      );
    }

    throw new Error(`Unknown IPC method: ${method}`);
  };
}

function registerIpcHandlers(ipcMain, projectRoot) {
  const invokeHandler = createInvokeHandler(path.resolve(projectRoot));
  ipcMain.handle(IPC_CHANNEL, invokeHandler);
  return () => {
    ipcMain.removeHandler(IPC_CHANNEL);
  };
}

module.exports = {
  IPC_CHANNEL,
  registerIpcHandlers,
};
