const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload.data;
}

export async function fetchConfig(configPath = "config.toml") {
  const encoded = encodeURIComponent(configPath);
  return requestJson(`/api/config?path=${encoded}`);
}

export async function saveConfig({ path, content }) {
  return requestJson("/api/config", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ path, content }),
  });
}

export async function listTasks(limit = 50) {
  return requestJson(`/api/tasks?limit=${limit}`);
}

export async function startTask(options) {
  return requestJson("/api/tasks", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(options || {}),
  });
}

export async function fetchManualOptions(configPath) {
  return requestJson("/api/manual/options", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      configPath: String(configPath || "config.toml"),
    }),
  });
}

export async function fetchAppTemplates(configPath) {
  return requestJson("/api/app-templates", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      configPath: String(configPath || "config.toml"),
    }),
  });
}

export async function fetchTask(taskId) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export async function deleteTask(taskId) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: "{}",
  });
}

export async function deleteAllTasks() {
  return requestJson("/api/tasks", {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: "{}",
  });
}

export async function clearAllCache() {
  return requestJson("/api/cache", {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: "{}",
  });
}

export async function stopTask(taskId) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}/stop`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
}

export async function fetchTaskLog(taskId, tail = 300) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}/log?tail=${tail}`);
}

export async function fetchTaskArtifacts(taskId) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}/artifacts`);
}

export async function openTaskOutputDir(taskId) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}/open-output`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}",
  });
}

export async function openTaskArtifactDir(taskId, relativePath) {
  return requestJson(`/api/tasks/${encodeURIComponent(taskId)}/open-artifact-dir`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      relativePath: String(relativePath || ""),
    }),
  });
}

export async function probeMorpheCliSource(options) {
  return requestJson("/api/probe/morphe-cli", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(options || {}),
  });
}

export async function probePatchesSource(options) {
  return requestJson("/api/probe/patches", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(options || {}),
  });
}

export async function fetchAppCompatibleVersions(configPath, app) {
  return requestJson("/api/apps/compatible-versions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      configPath: String(configPath || "config.toml"),
      app: app && typeof app === "object" ? app : {},
    }),
  });
}

export async function listSourceFiles(type) {
  return requestJson(`/api/source-files?type=${encodeURIComponent(String(type || ""))}`);
}

export async function fetchAndSaveSource(options) {
  return requestJson("/api/source/fetch-save", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(options || {}),
  });
}

export async function fetchSourceVersions(options) {
  return requestJson("/api/source/versions", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(options || {}),
  });
}

export async function deleteSourceFile(type, relativePath) {
  return requestJson("/api/source/file", {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      type: String(type || ""),
      relativePath: String(relativePath || ""),
    }),
  });
}

export async function deleteAllSourceFiles(type) {
  return requestJson(`/api/source-files?type=${encodeURIComponent(String(type || ""))}`, {
    method: "DELETE",
    headers: JSON_HEADERS,
    body: "{}",
  });
}
