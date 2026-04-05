"use strict";

const fsp = require("fs").promises;
const fs = require("fs");
const path = require("path");
const http = require("http");
const { TaskService } = require("./task-service");

const HOST = process.env.WEB_API_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.WEB_API_PORT || "8787", 10);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = process.env.WEB_STATIC_DIR
  ? path.resolve(PROJECT_ROOT, process.env.WEB_STATIC_DIR)
  : null;
const taskService = new TaskService(PROJECT_ROOT);

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

function resolveProjectPath(maybeRelativePath, fallbackRelative) {
  const selected = maybeRelativePath && String(maybeRelativePath).trim()
    ? String(maybeRelativePath).trim()
    : fallbackRelative;
  const resolved = path.resolve(PROJECT_ROOT, selected);
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(`${PROJECT_ROOT}${path.sep}`)) {
    throw new Error(`Path is outside project root: ${selected}`);
  }
  return resolved;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  });
  res.end(`${JSON.stringify(payload)}\n`);
}

function sendNotFound(res) {
  sendJson(res, 404, {
    ok: false,
    error: "Not Found",
  });
}

function sendMethodNotAllowed(res) {
  sendJson(res, 405, {
    ok: false,
    error: "Method Not Allowed",
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES.get(ext) || "application/octet-stream";
}

async function trySendStaticFile(res, filePath) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  return new Promise((resolve) => {
    res.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "no-store",
    });
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: "Failed to read static file" });
      } else {
        res.destroy();
      }
      resolve(false);
    });
    stream.on("end", () => resolve(true));
    stream.pipe(res);
  });
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    const size = chunks.reduce((sum, item) => sum + item.length, 0);
    if (size > 1024 * 1024) {
      throw new Error("Request body too large (max 1MB)");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function normalizeBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

async function handleRequest(req, res) {
  if (!req.url) {
    sendNotFound(res);
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      data: {
        service: "web-api",
        host: HOST,
        port: PORT,
        projectRoot: PROJECT_ROOT,
      },
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/package-map") {
    sendJson(res, 200, {
      ok: true,
      data: {
        map: taskService.getPackageMetaMap(),
      },
    });
    return;
  }

  if (pathname === "/api/config") {
    if (req.method === "GET") {
      const configPathRaw = url.searchParams.get("path") || "config.toml";
      const configPath = resolveProjectPath(configPathRaw, "config.toml");
      const content = await fsp.readFile(configPath, "utf8");
      sendJson(res, 200, {
        ok: true,
        data: {
          path: configPath,
          content,
        },
      });
      return;
    }

    if (req.method === "PUT") {
      const body = await parseJsonBody(req);
      const configPathRaw = body.path || "config.toml";
      const configPath = resolveProjectPath(configPathRaw, "config.toml");
      const content = String(body.content || "");

      await fsp.mkdir(path.dirname(configPath), { recursive: true });
      await fsp.writeFile(configPath, content, "utf8");

      sendJson(res, 200, {
        ok: true,
        data: {
          path: configPath,
          saved: true,
        },
      });
      return;
    }

    sendMethodNotAllowed(res);
    return;
  }

  if (pathname === "/api/tasks") {
    if (req.method === "GET") {
      const limit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
      const tasks = await taskService.listTasks(Number.isFinite(limit) ? limit : 50);
      sendJson(res, 200, {
        ok: true,
        data: {
          tasks,
        },
      });
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      const persistLogs = Object.prototype.hasOwnProperty.call(body, "persistLogs")
        ? normalizeBoolean(body.persistLogs)
        : true;
      const task = taskService.startTask({
        configPath: body.configPath,
        workspacePath: body.workspacePath,
        migrateWorkspace: normalizeBoolean(body.migrateWorkspace),
        force: normalizeBoolean(body.force),
        dryRun: normalizeBoolean(body.dryRun),
        downloadOnly: normalizeBoolean(body.downloadOnly),
        patchesOnly: normalizeBoolean(body.patchesOnly),
        morpheCliOnly: normalizeBoolean(body.morpheCliOnly),
        manual: normalizeBoolean(body.manual),
        manualPlan: body.manualPlan && typeof body.manualPlan === "object" ? body.manualPlan : null,
        persistLogs,
      });

      sendJson(res, 201, {
        ok: true,
        data: {
          task,
        },
      });
      return;
    }

    if (req.method === "DELETE") {
      const data = await taskService.deleteAllTasks();
      sendJson(res, 200, {
        ok: true,
        data,
      });
      return;
    }

    sendMethodNotAllowed(res);
    return;
  }

  if (pathname === "/api/cache") {
    if (req.method !== "DELETE") {
      sendMethodNotAllowed(res);
      return;
    }
    const data = await taskService.clearAllCache();
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/manual/options") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.getManualOptions(body.configPath);
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/app-templates") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.getAppTemplates(body.configPath);
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/probe/morphe-cli") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.probeMorpheCliSource({
      mode: body.mode,
      patchesRepo: body.patchesRepo,
      version: body.version,
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/probe/patches") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.probePatchesSource({
      mode: body.mode,
      patchesRepo: body.patchesRepo,
      version: body.version,
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/apps/compatible-versions") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.getAppCompatibleVersions({
      configPath: body.configPath,
      app: body.app && typeof body.app === "object" ? body.app : {},
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/source-files") {
    if (req.method === "GET") {
      const type = String(url.searchParams.get("type") || "").trim();
      const data = await taskService.listSourceFiles(type);
      sendJson(res, 200, {
        ok: true,
        data,
      });
      return;
    }
    if (req.method === "DELETE") {
      const type = String(url.searchParams.get("type") || "").trim();
      const data = await taskService.deleteAllSourceFiles(type);
      sendJson(res, 200, {
        ok: true,
        data,
      });
      return;
    }
    sendMethodNotAllowed(res);
    return;
  }

  if (pathname === "/api/source/fetch-save") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.fetchAndSaveSource({
      type: body.type,
      mode: body.mode,
      patchesRepo: body.patchesRepo,
      version: body.version,
      force: normalizeBoolean(body.force),
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/source/versions") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.listSourceRepoVersions({
      type: body.type,
      repo: body.repo,
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (pathname === "/api/source/file") {
    if (req.method !== "DELETE") {
      sendMethodNotAllowed(res);
      return;
    }
    const body = await parseJsonBody(req);
    const data = await taskService.deleteSourceFile({
      type: body.type,
      fileName: body.fileName,
      relativePath: body.relativePath,
    });
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  const stopMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/stop$/u);
  if (stopMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }

    const taskId = decodeURIComponent(stopMatch[1]);
    const task = taskService.stopTask(taskId);
    if (!task) {
      sendNotFound(res);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: {
        task,
      },
    });
    return;
  }

  const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/u);
  if (taskMatch) {
    const taskId = decodeURIComponent(taskMatch[1]);
    if (req.method === "DELETE") {
      const data = await taskService.deleteTask(taskId);
      sendJson(res, 200, {
        ok: true,
        data,
      });
      return;
    }

    if (req.method === "GET") {
      const task = await taskService.getTask(taskId);
      if (!task) {
        sendNotFound(res);
        return;
      }

      sendJson(res, 200, {
        ok: true,
        data: {
          task,
        },
      });
      return;
    }

    sendMethodNotAllowed(res);
    return;
  }

  const logMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/log$/u);
  if (logMatch) {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return;
    }

    const taskId = decodeURIComponent(logMatch[1]);
    const tail = Number.parseInt(url.searchParams.get("tail") || "300", 10);
    const logData = await taskService.getTaskLog(taskId, tail);
    if (!logData) {
      sendNotFound(res);
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: logData,
    });
    return;
  }

  const artifactsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/artifacts$/u);
  if (artifactsMatch) {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return;
    }

    const taskId = decodeURIComponent(artifactsMatch[1]);
    const data = await taskService.getTaskArtifacts(taskId);
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  const openOutputMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/open-output$/u);
  if (openOutputMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }

    const taskId = decodeURIComponent(openOutputMatch[1]);
    const data = await taskService.openTaskOutputDir(taskId);
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  const openArtifactDirMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/open-artifact-dir$/u);
  if (openArtifactDirMatch) {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return;
    }

    const taskId = decodeURIComponent(openArtifactDirMatch[1]);
    const body = await parseJsonBody(req);
    const data = await taskService.openTaskArtifactDir(taskId, body.relativePath);
    sendJson(res, 200, {
      ok: true,
      data,
    });
    return;
  }

  if (STATIC_DIR && req.method === "GET") {
    const requested = decodeURIComponent(pathname || "/");
    const normalized = requested === "/" ? "/index.html" : requested;
    const targetPath = path.resolve(STATIC_DIR, `.${normalized}`);
    if (targetPath.startsWith(`${STATIC_DIR}${path.sep}`) || targetPath === path.resolve(STATIC_DIR, "index.html")) {
      const served = await trySendStaticFile(res, targetPath);
      if (served) {
        return;
      }
    }

    const indexPath = path.join(STATIC_DIR, "index.html");
    const servedIndex = await trySendStaticFile(res, indexPath);
    if (servedIndex) {
      return;
    }
  }

  sendNotFound(res);
}

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Web API listening on http://${HOST}:${PORT}`);
});
