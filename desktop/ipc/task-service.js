"use strict";

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { spawnCliTask } = require("./cli-connector");
const { createRuntime } = require("../../utils/runtime");
const { hasValue, pickFirstValue, resolveAbsolutePath, safeFileName, formatError } = require("../../utils/common");
const { readTomlFile } = require("../../utils/toml");
const { toAbsoluteUrl, getHrefMatches, selectBestByVersion } = require("../../utils/url");
const morpheCli = require("../../scripts/morphe-cli");
const mpp = require("../../scripts/mpp");
const { resolveWorkspaceRoot, buildWorkspacePaths } = require("../../utils/workspace");
const PACKAGE_NAME_MAP = require("../../utils/package-name-map.json");

const MAX_IN_MEMORY_LINES = 2000;
const TASK_STATUS_COMPLETED_MARKER = "__TASK_STATUS__:completed";
const TASK_STATUS_FAILED_MARKER = "__TASK_STATUS__:failed";
const DEFAULT_MORPHE_PATCHES_REPO = "MorpheApp/morphe-patches";
const RESERVED_SECTIONS = new Set(["global", "patches", "morphe-cli", "morphe_cli"]);

function getPackageMapRecord(packageName) {
  const key = String(packageName || "").trim().toLowerCase();
  if (!key) return null;
  const mapped = PACKAGE_NAME_MAP[key];
  if (!hasValue(mapped)) return null;
  if (typeof mapped === "string") {
    return {
      label: String(mapped).trim(),
      icon: "",
      section: "",
    };
  }
  if (mapped && typeof mapped === "object") {
    return {
      label: hasValue(mapped.label) ? String(mapped.label).trim() : "",
      icon: hasValue(mapped.icon) ? String(mapped.icon).trim() : "",
      section: hasValue(mapped.section) ? String(mapped.section).trim() : "",
    };
  }
  return null;
}

function mapPackageDisplayName(packageName) {
  if (!hasValue(packageName)) return "";
  const record = getPackageMapRecord(packageName);
  if (record && hasValue(record.label)) return String(record.label).trim();
  return `[${packageName}]`;
}

function nameToSectionName(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "";
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`;
  return normalized;
}

function packageToSectionName(packageName) {
  const record = getPackageMapRecord(packageName);
  const mappedSection = hasValue(record && record.section) ? nameToSectionName(record.section) : "";
  if (mappedSection) return mappedSection;
  const mappedName = hasValue(record && record.label) ? String(record.label).trim() : "";
  if (mappedName) {
    const sectionFromLabel = nameToSectionName(mappedName);
    if (sectionFromLabel) return sectionFromLabel;
  }
  const normalized = String(packageName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return "app_template";
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`;
  return normalized;
}

function normalizeTemplatePackageName(template) {
  const directCandidates = [
    template && template.packageName,
    template && template.package_name,
    template && template.package,
  ];
  for (const candidate of directCandidates) {
    if (hasValue(candidate)) {
      return String(candidate).trim();
    }
  }

  const section = hasValue(template && template.section)
    ? String(template.section).trim()
    : hasValue(template && template.key)
      ? String(template.key).trim()
      : "";
  if (!section) return "";
  if (!section.includes(".") && /_/u.test(section)) {
    const restored = section.replace(/_/gu, ".");
    if (/^[a-z0-9]+(\.[a-z0-9_]+)+$/iu.test(restored)) {
      return restored;
    }
  }
  return "";
}

function normalizeTemplateRecord(template) {
  const packageName = normalizeTemplatePackageName(template);
  const section = hasValue(packageName)
    ? packageToSectionName(packageName)
    : (hasValue(template && template.section)
      ? String(template.section).trim()
      : "");
  const label = hasValue(template && template.label)
    ? String(template.label).trim()
    : mapPackageDisplayName(packageName || section);
  return {
    key: hasValue(template && template.key) ? String(template.key).trim() : section,
    section,
    packageName,
    label,
  };
}

function buildPackageMetaMap() {
  const result = {};
  for (const packageName of Object.keys(PACKAGE_NAME_MAP || {})) {
    const record = getPackageMapRecord(packageName);
    if (!record) continue;
    result[String(packageName).trim().toLowerCase()] = {
      label: hasValue(record.label) ? String(record.label).trim() : `[${packageName}]`,
      icon: hasValue(record.icon) ? String(record.icon).trim() : "",
      section: hasValue(record.section) ? nameToSectionName(record.section) : packageToSectionName(packageName),
    };
  }
  return result;
}

function resolvePatchesCfgForApiReads(patchesCfgInput) {
  const patchesCfg = patchesCfgInput && typeof patchesCfgInput === "object" ? patchesCfgInput : {};
  const mode = String(pickFirstValue(patchesCfg, ["mode"]) || "")
    .trim()
    .toLowerCase();
  const localPath = pickFirstValue(patchesCfg, ["path"]);
  if (mode === "local" && !hasValue(localPath)) {
    return {
      ...patchesCfg,
      mode: "stable",
    };
  }
  return patchesCfg;
}

async function resolveMorpheCliCfgForApiReads(morpheCliCfgInput, configDir, fileExistsFn) {
  const morpheCliCfg = morpheCliCfgInput && typeof morpheCliCfgInput === "object" ? morpheCliCfgInput : {};
  const mode = String(pickFirstValue(morpheCliCfg, ["mode"]) || "")
    .trim()
    .toLowerCase();
  if (mode !== "local") {
    return morpheCliCfg;
  }
  const localPathRaw = pickFirstValue(morpheCliCfg, ["path", "jar_path", "jar-path"]);
  if (!hasValue(localPathRaw)) {
    return {
      ...morpheCliCfg,
      mode: "stable",
    };
  }
  const localPath = resolveAbsolutePath(String(localPathRaw).trim(), configDir);
  const exists = await fileExistsFn(localPath).catch(() => false);
  if (exists) {
    return morpheCliCfg;
  }
  return {
    ...morpheCliCfg,
    mode: "stable",
  };
}

function resolveHistoricalTaskStatus(markerStatus, hasReleaseMetadata) {
  if (markerStatus === "completed") {
    return { status: "completed", exitCode: 0 };
  }
  if (markerStatus === "failed") {
    return { status: "failed", exitCode: 1 };
  }
  if (hasReleaseMetadata) {
    return { status: "completed", exitCode: 0 };
  }
  return { status: "incomplete", exitCode: null };
}

function sanitizeTailCount(value) {
  const n = Number.parseInt(String(value || "200"), 10);
  if (!Number.isFinite(n) || n <= 0) return 200;
  return Math.min(n, 5000);
}

function resolveInsideProject(projectRoot, maybePath, fallbackRelative) {
  const selected = maybePath && String(maybePath).trim() ? String(maybePath).trim() : fallbackRelative;
  const absolute = path.resolve(projectRoot, selected);
  const normalizedRoot = path.resolve(projectRoot);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Path is outside project root: ${selected}`);
  }
  return absolute;
}

async function fileExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(targetPath) {
  if (!(await fileExists(targetPath))) return null;
  const raw = await fsp.readFile(targetPath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/u, ""));
}

async function readTaskStatusMarker(taskLogPath) {
  if (!(await fileExists(taskLogPath))) {
    return null;
  }
  const raw = await fsp.readFile(taskLogPath, "utf8");
  if (raw.includes(TASK_STATUS_FAILED_MARKER)) {
    return "failed";
  }
  if (raw.includes(TASK_STATUS_COMPLETED_MARKER)) {
    return "completed";
  }
  return null;
}

async function collectApkFilesRecursive(rootDir) {
  const found = [];
  async function walk(currentDir) {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".apk")) {
        continue;
      }
      const stat = await fsp.stat(fullPath);
      found.push({
        fileName: entry.name,
        fullPath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
  await walk(rootDir);
  found.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  return found;
}

async function collectSourceFilesRecursive(rootDir, ext) {
  const found = [];
  async function walk(currentDir) {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(ext)) continue;
      const stat = await fsp.stat(fullPath);
      found.push({
        name: entry.name,
        fullPath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
  await walk(rootDir);
  found.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  return found;
}

function toTaskSummary(task) {
  return {
    id: task.id,
    source: task.source,
    status: task.status,
    pid: task.pid || null,
    exitCode: task.exitCode,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt || null,
    configPath: task.configPath || null,
    modes: task.modes || {},
    taskOutputDir: task.taskOutputDir || null,
    taskFolderName: task.taskFolderName || null,
    taskLogPath: task.taskLogPath || null,
    args: task.args || [],
    persistLogs: task.persistLogs !== false,
    stopRequested: !!task.stopRequested,
    workspacePath: task.workspacePath || null,
  };
}

function getSourceSpec(type) {
  const key = String(type || "").trim().toLowerCase();
  if (key === "morphe-cli") {
    return { type: key, ext: ".jar", folderKey: "morpheCli" };
  }
  if (key === "patches") {
    return { type: key, ext: ".mpp", folderKey: "patches" };
  }
  throw new Error(`Unsupported source type: ${type}`);
}

function isGitHubRateLimitError(err) {
  const text = String(err && err.message ? err.message : err || "").toLowerCase();
  return text.includes("rate limit exceeded") || text.includes("api.github.com") && text.includes("http 403");
}

function repoToDirName(repo) {
  return String(repo || "").trim().replace(/\//g, "@");
}

function repoDirNameToRepo(repoDirName) {
  return String(repoDirName || "").trim().replace(/@/g, "/");
}

function normalizeSourceReleaseKeyPart(value) {
  return String(value || "").trim().toLowerCase();
}

function buildSourceReleaseRecordKey(type, repo, fileName) {
  const typeKey = normalizeSourceReleaseKeyPart(type);
  const repoKey = normalizeSourceReleaseKeyPart(repo);
  const fileKey = normalizeSourceReleaseKeyPart(fileName);
  if (!typeKey || !repoKey || !fileKey) return "";
  return `${typeKey}|${repoKey}|${fileKey}`;
}

function inferRepoFromSourceRelativePath(relativePath) {
  const normalized = String(relativePath || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";
  const repoDir = String(normalized.split("/")[0] || "").trim();
  if (!repoDir || !repoDir.includes("@")) return "";
  return repoDirNameToRepo(repoDir);
}

async function fetchGitHubReleases(repo, runtime) {
  const repoValue = String(repo || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repoValue)) {
    throw new Error(`Invalid repo format: ${repoValue}. Expected owner/repo.`);
  }
  const apiUrl = `https://api.github.com/repos/${repoValue}/releases?per_page=50`;
  const payload = (await runtime.runCurl(apiUrl)).stdout.toString("utf8");
  let releases = null;
  try {
    releases = JSON.parse(payload);
  } catch {
    throw new Error(`Failed to parse GitHub releases response for ${repoValue}.`);
  }
  if (!Array.isArray(releases)) {
    throw new Error(`Invalid GitHub releases response for ${repoValue}.`);
  }
  return releases;
}

class TaskService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    const workspaceRoot = resolveWorkspaceRoot({
      cliWorkspace: "",
      envWorkspace: process.env.MORPHE_WORKSPACE,
      cwd: projectRoot,
      env: process.env,
    });
    this.workspacePaths = buildWorkspacePaths(workspaceRoot);
    this.outputDir = this.workspacePaths.output;
    this.cacheDir = this.workspacePaths.cache;
    this.versionsCacheDir = path.join(this.cacheDir, "compatible-versions");
    this.patchEntriesCacheDir = path.join(this.cacheDir, "patch-entries");
    this.templatesCacheDir = path.join(this.cacheDir, "app-templates");
    this.sourceReleaseMetadataPath = path.join(this.workspacePaths.runtime, "source-release-times.json");
    this.patchEntriesParserVersion = "v5";
    this.tasks = new Map();
  }

  getPackageMetaMap() {
    return buildPackageMetaMap();
  }

  async checkJavaVersion() {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = spawn("java", ["-version"], {
        shell: false,
      });

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        resolve({
          nodeVersion: String(process.version || "").trim(),
          installed: false,
          version: "",
          raw: "",
          error: error && error.message ? String(error.message) : String(error || "java not found"),
        });
      });

      child.on("close", (code) => {
        const raw = `${stderr}${stdout}`.trim();
        const firstLine = String(raw || "")
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .find(Boolean) || "";
        const quoted = firstLine.match(/version\s+"([^"]+)"/iu);
        const plain = firstLine.match(/openjdk\s+([0-9][^\s]*)/iu);
        const version = quoted ? String(quoted[1] || "").trim() : plain ? String(plain[1] || "").trim() : "";
        const installed = code === 0 && (Boolean(version) || Boolean(firstLine));
        resolve({
          nodeVersion: String(process.version || "").trim(),
          installed,
          version,
          raw,
          error: installed ? "" : `java exited with code ${typeof code === "number" ? code : "unknown"}`,
        });
      });
    });
  }

  async openAssetsDir(kind) {
    const key = String(kind || "").trim().toLowerCase();
    let targetDir = "";
    if (key === "morphe-cli") targetDir = this.workspacePaths.morpheCli;
    if (key === "patches") targetDir = this.workspacePaths.patches;
    if (key === "downloads" || key === "apk") targetDir = this.workspacePaths.downloads;
    if (!targetDir) {
      throw new Error(`Unsupported assets dir kind: ${kind}`);
    }

    await fsp.mkdir(targetDir, { recursive: true });

    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "explorer";
      args = [targetDir];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [targetDir];
    } else {
      command = "xdg-open";
      args = [targetDir];
    }

    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        shell: false,
      });
      child.on("error", (err) => reject(err));
      child.unref();
      resolve();
    });

    return {
      opened: true,
      kind: key,
      path: targetDir,
    };
  }

  async readCacheJson(cacheDir, cacheKey) {
    const filePath = path.join(cacheDir, `${cacheKey}.json`);
    if (!(await fileExists(filePath))) return null;
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw.replace(/^\uFEFF/u, ""));
    } catch {
      return null;
    }
  }

  async writeCacheJson(cacheDir, cacheKey, data) {
    const filePath = path.join(cacheDir, `${cacheKey}.json`);
    await fsp.mkdir(cacheDir, { recursive: true });
    await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  async readSourceReleaseMetadata() {
    if (!(await fileExists(this.sourceReleaseMetadataPath))) {
      return { entries: {} };
    }
    try {
      const raw = await fsp.readFile(this.sourceReleaseMetadataPath, "utf8");
      const parsed = JSON.parse(raw.replace(/^\uFEFF/u, ""));
      const entries = parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object"
        ? parsed.entries
        : {};
      return { entries };
    } catch {
      return { entries: {} };
    }
  }

  async writeSourceReleaseMetadata(data) {
    const payload = data && typeof data === "object" ? data : {};
    const entries = payload.entries && typeof payload.entries === "object" ? payload.entries : {};
    await fsp.mkdir(path.dirname(this.sourceReleaseMetadataPath), { recursive: true });
    await fsp.writeFile(
      this.sourceReleaseMetadataPath,
      `${JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        entries,
      }, null, 2)}\n`,
      "utf8",
    );
  }

  async upsertSourceReleaseMetadata(type, repo, versions) {
    const repoValue = String(repo || "").trim();
    const list = Array.isArray(versions) ? versions : [];
    if (!repoValue || list.length === 0) return;

    const metadata = await this.readSourceReleaseMetadata();
    const entries = metadata.entries && typeof metadata.entries === "object" ? metadata.entries : {};
    let changed = false;

    for (const item of list) {
      const fileName = String(item && item.fileName ? item.fileName : "").trim();
      const publishedAt = String(item && item.publishedAt ? item.publishedAt : "").trim();
      const tag = String(item && item.tag ? item.tag : "").trim();
      if (!fileName || !publishedAt) continue;
      const key = buildSourceReleaseRecordKey(type, repoValue, fileName);
      if (!key) continue;
      const prev = entries[key] && typeof entries[key] === "object" ? entries[key] : {};
      if (String(prev.publishedAt || "") === publishedAt && String(prev.tag || "") === tag) {
        continue;
      }
      entries[key] = {
        type: String(type || "").trim(),
        repo: repoValue,
        repoDirName: repoToDirName(repoValue),
        fileName,
        publishedAt,
        tag,
        savedAt: new Date().toISOString(),
      };
      changed = true;
    }

    if (!changed) return;
    await this.writeSourceReleaseMetadata({ entries });
  }

  async getFileFingerprint(filePath) {
    const stat = await fsp.stat(filePath);
    return {
      name: path.basename(filePath),
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
    };
  }

  buildCacheKey(payload) {
    return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  }

  parsePatchEntriesFromRawPayload(rawPayload) {
    if (typeof rawPayload === "string") {
      return mpp.parsePatchEntries(rawPayload).sort((a, b) => a.index - b.index);
    }
    if (!rawPayload || typeof rawPayload !== "object") {
      return [];
    }
    const withOptions = typeof rawPayload.withOptions === "string" ? rawPayload.withOptions : "";
    const defaults = typeof rawPayload.defaults === "string" ? rawPayload.defaults : "";
    const withOptionsEntries = mpp.parsePatchEntries(withOptions);
    const defaultEntries = mpp.parsePatchEntries(defaults);
    return mpp.mergePatchEntries(withOptionsEntries, defaultEntries);
  }

  createTaskContext(runtime) {
    return {
      hasValue,
      pickFirstValue,
      resolveAbsolutePath,
      safeFileName,
      formatError,
      toAbsoluteUrl,
      getHrefMatches,
      selectBestByVersion,
      fileExists: runtime.fileExists,
      downloadFile: runtime.downloadFile,
      runCurl: runtime.runCurl,
      runCommandCapture: runtime.runCommandCapture,
      ensureDir: runtime.ensureDir,
      removeDirRecursive: runtime.removeDirRecursive,
      logInfo: () => {},
      logWarn: () => {},
      logStep: () => {},
      defaultPatchesRepo: DEFAULT_MORPHE_PATCHES_REPO,
    };
  }

  async getAppTemplates(configPathInput) {
    const configPath = resolveInsideProject(this.projectRoot, configPathInput, "config.toml");
    const configDir = path.dirname(configPath);
    const runtime = createRuntime({
      cookieJarPath: path.join(this.workspacePaths.downloads, ".morphe-cookie.txt"),
      cacheDir: this.workspacePaths.cache,
      logStep: () => {},
    });
    const config = await readTomlFile(configPath, runtime.fileExists);
    const morpheCliCfg = await resolveMorpheCliCfgForApiReads(
      config["morphe-cli"] || config.morphe_cli || {},
      configDir,
      runtime.fileExists,
    );
    const patchesCfg = resolvePatchesCfgForApiReads(config.patches || {});
    const ctx = this.createTaskContext(runtime);

    const jarPath = await morpheCli.resolveMorpheCliJar({
      configDir,
      workspaceDir: this.workspacePaths.root,
      morpheCliCfg,
      dryRun: false,
      force: false,
      ctx,
    });

    const patchPath = await mpp.resolvePatchFile({
      app: {},
      appName: "__templates__",
      configDir,
      workspaceDir: this.workspacePaths.root,
      patchesCfg,
      dryRun: false,
      force: false,
      ctx,
    });

    const jarFp = await this.getFileFingerprint(jarPath);
    const patchFp = await this.getFileFingerprint(patchPath);
    const templatesCacheKey = this.buildCacheKey({
      type: "app-templates",
      jar: jarFp,
      patch: patchFp,
    });
    const templatesCached = await this.readCacheJson(this.templatesCacheDir, templatesCacheKey);
    if (templatesCached && Array.isArray(templatesCached.templates)) {
      const templates = templatesCached.templates.map((item) => normalizeTemplateRecord(item));
      return {
        configPath,
        templates,
        cache: { hit: true, key: templatesCacheKey },
      };
    }

    const packages = await mpp.listSupportedPackages({
      jarPath,
      patchPath,
      ctx,
    });

    const templates = packages.map((packageName) => normalizeTemplateRecord({
      key: packageToSectionName(packageName),
      section: packageToSectionName(packageName),
      packageName,
      label: mapPackageDisplayName(packageName),
    }));

    await this.writeCacheJson(this.templatesCacheDir, templatesCacheKey, {
      savedAt: new Date().toISOString(),
      cacheType: "app-templates",
      key: templatesCacheKey,
      jar: jarFp,
      patch: patchFp,
      templates,
    });

    return {
      configPath,
      templates,
      cache: { hit: false, key: templatesCacheKey },
    };
  }

  async listSourceFiles(type) {
    const spec = getSourceSpec(type);
    const targetDir = this.workspacePaths[spec.folderKey];
    await fsp.mkdir(targetDir, { recursive: true });
    const releaseMetadata = await this.readSourceReleaseMetadata();
    const releaseEntries = releaseMetadata.entries && typeof releaseMetadata.entries === "object"
      ? releaseMetadata.entries
      : {};
    const files = await collectSourceFilesRecursive(targetDir, spec.ext);
    return {
      type: spec.type,
      dir: targetDir,
      files: files.map((item) => {
        const relativePath = path.relative(targetDir, item.fullPath);
        const repo = inferRepoFromSourceRelativePath(relativePath);
        const key = buildSourceReleaseRecordKey(spec.type, repo, item.name);
        const release = key ? releaseEntries[key] : null;
        return {
          ...item,
          relativePath,
          repo,
          publishedAt: String(release && release.publishedAt ? release.publishedAt : ""),
        };
      }),
    };
  }

  async fetchAndSaveSource(options) {
    const spec = getSourceSpec(options && options.type);
    const runtime = createRuntime({
      cookieJarPath: path.join(this.workspacePaths.downloads, ".morphe-cookie.txt"),
      cacheDir: this.workspacePaths.cache,
      logStep: () => {},
    });
    const ctx = this.createTaskContext(runtime);
    const force = !!(options && options.force);
    const configDir = this.projectRoot;

    try {
      if (spec.type === "morphe-cli") {
        const morpheCliCfg = {
          mode: String(options && options.mode ? options.mode : "stable").trim(),
          patches_repo: String(options && options.patchesRepo ? options.patchesRepo : "").trim(),
          ver: String(options && options.version ? options.version : "").trim(),
        };
        const fullPath = await morpheCli.resolveMorpheCliJar({
          configDir,
          workspaceDir: this.workspacePaths.root,
          morpheCliCfg,
          dryRun: false,
          force,
          ctx,
        });
        return {
          type: spec.type,
          fileName: path.basename(fullPath),
          fullPath,
          reusedLocal: false,
        };
      }

      const patchesCfg = {
        mode: String(options && options.mode ? options.mode : "stable").trim(),
        patches_repo: String(options && options.patchesRepo ? options.patchesRepo : "").trim(),
        ver: String(options && options.version ? options.version : "").trim(),
      };
      const fullPath = await mpp.resolvePatchFile({
        app: {},
        appName: "__source_probe__",
        configDir,
        workspaceDir: this.workspacePaths.root,
        patchesCfg,
        dryRun: false,
        force,
        ctx,
      });
      return {
        type: spec.type,
        fileName: path.basename(fullPath),
        fullPath,
        reusedLocal: false,
      };
    } catch (err) {
      if (isGitHubRateLimitError(err) && !force) {
        const existing = await this.listSourceFiles(spec.type);
        if (Array.isArray(existing.files) && existing.files.length > 0) {
          const latest = existing.files[0];
          return {
            type: spec.type,
            fileName: latest.name,
            fullPath: latest.fullPath,
            reusedLocal: true,
            warning: "GitHub API rate limit reached; reused latest local file.",
          };
        }
      }
      throw err;
    }
  }

  async listSourceRepoVersions(options) {
    const spec = getSourceSpec(options && options.type);
    const repo = String(options && options.repo ? options.repo : "").trim();
    if (!repo) throw new Error("repo is required.");
    const runtime = createRuntime({
      cookieJarPath: path.join(this.workspacePaths.downloads, ".morphe-cookie.txt"),
      cacheDir: this.workspacePaths.cache,
      logStep: () => {},
    });
    const releases = await fetchGitHubReleases(repo, runtime);
    const ext = spec.ext.toLowerCase();
    const versions = [];
    const seenFileNames = new Set();
    for (const release of releases) {
      if (release && release.draft) continue;
      const assets = Array.isArray(release.assets) ? release.assets : [];
      for (const asset of assets) {
        const name = String(asset && asset.name ? asset.name : "").trim();
        const url = String(asset && asset.browser_download_url ? asset.browser_download_url : "").trim();
        if (!name || !url) continue;
        if (!name.toLowerCase().endsWith(ext)) continue;
        const key = name.toLowerCase();
        if (seenFileNames.has(key)) continue;
        seenFileNames.add(key);
        versions.push({
          fileName: name,
          tag: String(release && release.tag_name ? release.tag_name : ""),
          publishedAt: String(release && release.published_at ? release.published_at : ""),
          url,
        });
      }
    }
    await this.upsertSourceReleaseMetadata(spec.type, repo, versions);
    return {
      type: spec.type,
      repo,
      versions,
    };
  }

  async listDownloadedApks() {
    const targetDir = this.workspacePaths.downloads;
    const legacyDir = path.join(this.projectRoot, "downloads");
    await fsp.mkdir(targetDir, { recursive: true });
    const primary = await collectApkFilesRecursive(targetDir).catch(() => []);
    const legacy = path.resolve(legacyDir) === path.resolve(targetDir)
      ? []
      : await collectApkFilesRecursive(legacyDir).catch(() => []);
    const seen = new Set();
    const files = [...primary, ...legacy].filter((item) => {
      const key = String(item.fullPath || "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      dir: targetDir,
      legacyDir,
      files: files.map((item) => ({
        name: item.fileName,
        fileName: item.fileName,
        fullPath: item.fullPath,
        relativePath: path.relative(targetDir, item.fullPath),
        sizeBytes: item.sizeBytes,
        modifiedAt: item.modifiedAt,
      })),
    };
  }

  async deleteDownloadedApk(options) {
    const fullPathRaw = String(options && options.fullPath ? options.fullPath : "").trim();
    if (!fullPathRaw) {
      throw new Error("fullPath is required.");
    }
    const fullPath = path.resolve(fullPathRaw);
    if (!fullPath.toLowerCase().endsWith(".apk")) {
      throw new Error("Only .apk files are supported.");
    }

    const primaryDir = path.resolve(this.workspacePaths.downloads);
    const legacyDir = path.resolve(path.join(this.projectRoot, "downloads"));
    const isInsidePrimary = fullPath.startsWith(`${primaryDir}${path.sep}`);
    const isInsideLegacy = fullPath.startsWith(`${legacyDir}${path.sep}`);
    if (!isInsidePrimary && !isInsideLegacy) {
      throw new Error("APK path is outside downloads directory.");
    }

    await fsp.rm(fullPath, { force: true });
    return {
      deleted: true,
      fullPath,
      fileName: path.basename(fullPath),
      dirType: isInsidePrimary ? "downloads" : "legacy-downloads",
    };
  }

  async deleteSourceFile(options) {
    const spec = getSourceSpec(options && options.type);
    const relativePath = String(
      options && (options.relativePath || options.fileName) ? (options.relativePath || options.fileName) : "",
    ).trim();
    if (!relativePath) throw new Error("relativePath is required.");
    if (path.isAbsolute(relativePath)) throw new Error("relativePath must not be absolute.");
    const normalizedRelative = relativePath.replace(/\\/g, "/");
    if (!normalizedRelative.toLowerCase().endsWith(spec.ext)) {
      throw new Error(`Invalid file extension for ${spec.type}: ${relativePath}`);
    }
    const targetDir = this.workspacePaths[spec.folderKey];
    const fullPath = path.resolve(targetDir, normalizedRelative);
    if (fullPath !== targetDir && !fullPath.startsWith(`${targetDir}${path.sep}`)) {
      throw new Error("relativePath is outside source directory.");
    }
    await fsp.rm(fullPath, { force: true });
    return {
      type: spec.type,
      deleted: true,
      fileName: path.basename(fullPath),
      relativePath: path.relative(targetDir, fullPath),
      fullPath,
    };
  }

  async getAppCompatibleVersions(options) {
    const configPath = resolveInsideProject(
      this.projectRoot,
      options && options.configPath ? options.configPath : "config.toml",
      "config.toml",
    );
    const configDir = path.dirname(configPath);
    const runtime = createRuntime({
      cookieJarPath: path.join(this.workspacePaths.downloads, ".morphe-cookie.txt"),
      cacheDir: this.workspacePaths.cache,
      logStep: () => {},
    });
    const config = await readTomlFile(configPath, runtime.fileExists);
    const morpheCliCfg = await resolveMorpheCliCfgForApiReads(
      config["morphe-cli"] || config.morphe_cli || {},
      configDir,
      runtime.fileExists,
    );
    const patchesCfg = resolvePatchesCfgForApiReads(config.patches || {});
    const appInput = options && typeof options.app === "object" ? options.app : {};
    const appName = String(appInput.name || "").trim() || "__app__";
    const app = {
      package_name: String(appInput.packageName || "").trim(),
      mode: String(appInput.mode || "").trim(),
    };
    const ctx = this.createTaskContext(runtime);

    let jarPath = "";
    try {
      jarPath = await morpheCli.resolveMorpheCliJar({
        configDir,
        workspaceDir: this.workspacePaths.root,
        morpheCliCfg,
        dryRun: false,
        force: false,
        ctx,
      });
    } catch (err) {
      const mode = String(pickFirstValue(morpheCliCfg, ["mode"]) || "").trim().toLowerCase();
      if (mode !== "local") throw err;
      morpheCliCfg = { ...morpheCliCfg, mode: "stable" };
      jarPath = await morpheCli.resolveMorpheCliJar({
        configDir,
        workspaceDir: this.workspacePaths.root,
        morpheCliCfg,
        dryRun: false,
        force: false,
        ctx,
      });
    }

    const patchPath = await mpp.resolvePatchFile({
      app,
      appName,
      configDir,
      workspaceDir: this.workspacePaths.root,
      patchesCfg,
      dryRun: false,
      force: false,
      ctx,
    });

    const packageName = String(app.package_name || "").trim().toLowerCase();
    const jarFp = await this.getFileFingerprint(jarPath);
    const patchFp = await this.getFileFingerprint(patchPath);
    const versionsCacheKey = this.buildCacheKey({
      type: "compatible-versions",
      jar: jarFp,
      patch: patchFp,
      packageName,
    });
    const versionsCached = await this.readCacheJson(this.versionsCacheDir, versionsCacheKey);
    const cachedRaw = versionsCached && typeof versionsCached.rawOutput === "string" ? versionsCached.rawOutput : "";
    if (cachedRaw.length > 0) {
      const compatibility = mpp.resolveCompatibleVersionsFromRaw(cachedRaw, appName, versionsCached.packageName || app.package_name || null);
      return {
        configPath,
        appName,
        packageName: compatibility.packageName || app.package_name || "",
        patchFileName: versionsCached.patchFileName || path.basename(patchPath),
        any: !!compatibility.any,
        versions: Array.isArray(compatibility.versions) ? compatibility.versions : [],
        cache: { hit: true, key: versionsCacheKey },
      };
    }

    const rawResult = await mpp.listCompatibleVersionsRaw({
      app,
      appName,
      jarPath,
      patchPath,
      ctx,
    });
    const compatibility = mpp.resolveCompatibleVersionsFromRaw(
      rawResult.rawOutput,
      appName,
      rawResult.packageName || app.package_name || null,
    );

    const result = {
      configPath,
      appName,
      packageName: compatibility.packageName || app.package_name || "",
      patchFileName: path.basename(patchPath),
      any: !!compatibility.any,
      versions: Array.isArray(compatibility.versions) ? compatibility.versions : [],
      cache: { hit: false, key: versionsCacheKey },
    };

    await this.writeCacheJson(this.versionsCacheDir, versionsCacheKey, {
      savedAt: new Date().toISOString(),
      cacheType: "compatible-versions",
      key: versionsCacheKey,
      jar: jarFp,
      patch: patchFp,
      patchFileName: result.patchFileName,
      packageName: rawResult.packageName || result.packageName || "",
      rawOutput: rawResult.rawOutput,
    });

    return result;
  }

  async getAppPatchEntries(options) {
    const configPath = resolveInsideProject(
      this.projectRoot,
      options && options.configPath ? options.configPath : "config.toml",
      "config.toml",
    );
    const configDir = path.dirname(configPath);
    const runtime = createRuntime({
      cookieJarPath: path.join(this.workspacePaths.downloads, ".morphe-cookie.txt"),
      cacheDir: this.workspacePaths.cache,
      logStep: () => {},
    });
    const config = await readTomlFile(configPath, runtime.fileExists);
    let morpheCliCfg = await resolveMorpheCliCfgForApiReads(
      config["morphe-cli"] || config.morphe_cli || {},
      configDir,
      runtime.fileExists,
    );
    let patchesCfg = resolvePatchesCfgForApiReads(config.patches || {});
    const appInput = options && typeof options.app === "object" ? options.app : {};
    const appName = String(appInput.name || "").trim() || "__app__";
    const app = {
      package_name: String(appInput.packageName || "").trim(),
      mode: String(appInput.mode || "").trim(),
    };
    const ctx = this.createTaskContext(runtime);

    let jarPath = "";
    try {
      jarPath = await morpheCli.resolveMorpheCliJar({
        configDir,
        workspaceDir: this.workspacePaths.root,
        morpheCliCfg,
        dryRun: false,
        force: false,
        ctx,
      });
    } catch (err) {
      const mode = String(pickFirstValue(morpheCliCfg, ["mode"]) || "").trim().toLowerCase();
      if (mode !== "local") throw err;
      morpheCliCfg = { ...morpheCliCfg, mode: "stable" };
      jarPath = await morpheCli.resolveMorpheCliJar({
        configDir,
        workspaceDir: this.workspacePaths.root,
        morpheCliCfg,
        dryRun: false,
        force: false,
        ctx,
      });
    }

    const patchPath = await mpp.resolvePatchFile({
      app,
      appName,
      configDir,
      workspaceDir: this.workspacePaths.root,
      patchesCfg,
      dryRun: false,
      force: false,
      ctx,
    });

    const packageName = String(app.package_name || "").trim().toLowerCase();
    const jarFp = await this.getFileFingerprint(jarPath);
    const patchFp = await this.getFileFingerprint(patchPath);
    const cacheKey = this.buildCacheKey({
      type: "patch-entries",
      jar: jarFp,
      patch: patchFp,
      packageName,
      parser: this.patchEntriesParserVersion,
    });
    const cached = await this.readCacheJson(this.patchEntriesCacheDir, cacheKey);
    const cachedRaw = cached ? cached.rawOutput : null;
    const cachedEntries = this.parsePatchEntriesFromRawPayload(cachedRaw);
    if (cachedEntries.length > 0) {
      return {
        configPath,
        appName,
        packageName: cached.packageName || app.package_name || "",
        patchFileName: cached.patchFileName || path.basename(patchPath),
        entries: cachedEntries,
        cache: { hit: true, key: cacheKey },
      };
    }

    const rawResult = await mpp.listPatchEntriesRaw({
      app,
      appName,
      jarPath,
      patchPath,
      ctx,
    });
    const entries = this.parsePatchEntriesFromRawPayload(rawResult.rawOutput);
    await this.writeCacheJson(this.patchEntriesCacheDir, cacheKey, {
      savedAt: new Date().toISOString(),
      cacheType: "patch-entries",
      key: cacheKey,
      jar: jarFp,
      patch: patchFp,
      parser: this.patchEntriesParserVersion,
      patchFileName: path.basename(patchPath),
      packageName: String(rawResult.packageName || app.package_name || ""),
      rawOutput: rawResult.rawOutput,
    });
    return {
      configPath,
      appName,
      packageName: String(rawResult.packageName || app.package_name || ""),
      patchFileName: path.basename(patchPath),
      entries,
      cache: { hit: false, key: cacheKey },
    };
  }

  appendTaskLine(task, stream, line) {
    task.lines.push({
      at: new Date().toISOString(),
      stream,
      line,
    });
    if (task.lines.length > MAX_IN_MEMORY_LINES) {
      task.lines.splice(0, task.lines.length - MAX_IN_MEMORY_LINES);
    }
  }

  async readHistoricalTasks(limit = 50) {
    if (!(await fileExists(this.outputDir))) {
      return [];
    }

    const entries = await fsp.readdir(this.outputDir, { withFileTypes: true });
    const folders = entries
      .filter((entry) => entry.isDirectory() && /^task-/u.test(entry.name))
      .map((entry) => entry.name);

    const tasks = [];

    for (const folderName of folders) {
      const folderPath = path.join(this.outputDir, folderName);
      const taskInfoPath = path.join(folderPath, "task-info.json");
      const taskLogPath = path.join(folderPath, "task.log");
      const releaseMetadataPath = path.join(folderPath, "release-metadata.json");
      const info = await readJsonIfExists(taskInfoPath);
      const stat = await fsp.stat(folderPath);
      const markerStatus = await readTaskStatusMarker(taskLogPath);
      const historicalStatus = resolveHistoricalTaskStatus(
        markerStatus,
        await fileExists(releaseMetadataPath),
      );

      tasks.push({
        id: folderName,
        source: "history",
        status: historicalStatus.status,
        pid: null,
        exitCode: historicalStatus.exitCode,
        startedAt: info && info.startedAt ? info.startedAt : stat.mtime.toISOString(),
        finishedAt: stat.mtime.toISOString(),
        configPath: info && info.configPath ? info.configPath : null,
        modes: info && info.modes ? info.modes : {},
        taskOutputDir: folderPath,
        taskFolderName: folderName,
        taskLogPath: await fileExists(taskLogPath) ? taskLogPath : null,
        args: info && Array.isArray(info.argv) ? info.argv : [],
      });
    }

    tasks.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    return tasks.slice(0, limit);
  }

  async listTasks(limit = 50) {
    const live = Array.from(this.tasks.values()).map((task) => toTaskSummary(task));
    const history = await this.readHistoricalTasks(limit);

    const merged = [...live, ...history];
    const seen = new Set();
    const unique = [];

    for (const task of merged) {
      const key = task.taskFolderName || task.id;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(task);
    }

    unique.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
    return unique.slice(0, limit);
  }

  async getTask(taskId) {
    if (this.tasks.has(taskId)) {
      return toTaskSummary(this.tasks.get(taskId));
    }

    const folderPath = path.join(this.outputDir, String(taskId));
    if (!(await fileExists(folderPath))) {
      return null;
    }

    const taskInfoPath = path.join(folderPath, "task-info.json");
    const taskLogPath = path.join(folderPath, "task.log");
    const releaseMetadataPath = path.join(folderPath, "release-metadata.json");
    const info = await readJsonIfExists(taskInfoPath);
    const stat = await fsp.stat(folderPath);
    const markerStatus = await readTaskStatusMarker(taskLogPath);
    const historicalStatus = resolveHistoricalTaskStatus(
      markerStatus,
      await fileExists(releaseMetadataPath),
    );

    return {
      id: String(taskId),
      source: "history",
      status: historicalStatus.status,
      pid: null,
      exitCode: historicalStatus.exitCode,
      startedAt: info && info.startedAt ? info.startedAt : stat.mtime.toISOString(),
      finishedAt: stat.mtime.toISOString(),
      configPath: info && info.configPath ? info.configPath : null,
      modes: info && info.modes ? info.modes : {},
      taskOutputDir: folderPath,
      taskFolderName: String(taskId),
      taskLogPath: await fileExists(taskLogPath) ? taskLogPath : null,
      args: info && Array.isArray(info.argv) ? info.argv : [],
    };
  }

  async getTaskLog(taskId, tailCount = 200) {
    const tail = sanitizeTailCount(tailCount);

    if (this.tasks.has(taskId)) {
      const task = this.tasks.get(taskId);
      if (task.taskLogPath && (await fileExists(task.taskLogPath))) {
        const raw = await fsp.readFile(task.taskLogPath, "utf8");
        const lines = raw.split(/\r?\n/u);
        return {
          source: "file",
          logPath: task.taskLogPath,
          content: lines.slice(-tail).join("\n"),
        };
      }

      const liveLines = task.lines.slice(-tail).map((line) => `[${line.stream}] ${line.line}`);
      return {
        source: "memory",
        logPath: null,
        content: liveLines.join("\n"),
      };
    }

    const folderLogPath = path.join(this.outputDir, String(taskId), "task.log");
    if (!(await fileExists(folderLogPath))) {
      return null;
    }

    const raw = await fsp.readFile(folderLogPath, "utf8");
    const lines = raw.split(/\r?\n/u);
    return {
      source: "file",
      logPath: folderLogPath,
      content: lines.slice(-tail).join("\n"),
    };
  }

  async resolveTaskOutputDir(taskId) {
    if (this.tasks.has(taskId)) {
      const live = this.tasks.get(taskId);
      if (live && live.taskOutputDir) {
        return live.taskOutputDir;
      }
    }
    const folderPath = path.join(this.outputDir, String(taskId));
    if (await fileExists(folderPath)) {
      return folderPath;
    }
    return null;
  }

  async getTaskArtifacts(taskId) {
    const outputDir = await this.resolveTaskOutputDir(taskId);
    if (!outputDir || !(await fileExists(outputDir))) {
      return {
        outputDir: outputDir || null,
        artifacts: [],
      };
    }

    const artifacts = await collectApkFilesRecursive(outputDir);
    return {
      outputDir,
      artifacts: artifacts.map((item) => ({
        fileName: item.fileName,
        fullPath: item.fullPath,
        relativePath: path.relative(outputDir, item.fullPath),
        sizeBytes: item.sizeBytes,
        modifiedAt: item.modifiedAt,
      })),
    };
  }

  async openTaskOutputDir(taskId) {
    const outputDir = await this.resolveTaskOutputDir(taskId);
    if (!outputDir || !(await fileExists(outputDir))) {
      throw new Error(`Task output directory not found: ${taskId}`);
    }

    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "explorer";
      args = [outputDir];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [outputDir];
    } else {
      command = "xdg-open";
      args = [outputDir];
    }

    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        shell: false,
      });
      child.on("error", (err) => reject(err));
      child.unref();
      resolve();
    });

    return {
      opened: true,
      path: outputDir,
    };
  }

  async openTaskArtifactDir(taskId, relativePath) {
    const outputDir = await this.resolveTaskOutputDir(taskId);
    if (!outputDir || !(await fileExists(outputDir))) {
      throw new Error(`Task output directory not found: ${taskId}`);
    }
    const selected = String(relativePath || "").trim();
    if (!selected) {
      throw new Error("Artifact relativePath is required.");
    }

    const absolutePath = path.resolve(outputDir, selected);
    if (absolutePath !== outputDir && !absolutePath.startsWith(`${outputDir}${path.sep}`)) {
      throw new Error("Artifact path is outside task output directory.");
    }

    const folderPath = path.dirname(absolutePath);
    if (!(await fileExists(folderPath))) {
      throw new Error(`Artifact directory not found: ${folderPath}`);
    }

    let command = "";
    let args = [];
    if (process.platform === "win32") {
      command = "explorer";
      args = [folderPath];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [folderPath];
    } else {
      command = "xdg-open";
      args = [folderPath];
    }

    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: "ignore",
        detached: true,
        shell: false,
      });
      child.on("error", (err) => reject(err));
      child.unref();
      resolve();
    });

    return {
      opened: true,
      path: folderPath,
      artifactPath: absolutePath,
    };
  }

  isTaskRunning(task) {
    if (!task) return false;
    const status = String(task.status || "").toLowerCase();
    return status === "running" || status === "stopping";
  }

  async deleteTask(taskId) {
    const key = String(taskId || "").trim();
    if (!key) {
      throw new Error("Task id is required.");
    }

    if (this.tasks.has(key)) {
      const live = this.tasks.get(key);
      if (this.isTaskRunning(live)) {
        throw new Error(`Task is running and cannot be deleted: ${key}`);
      }
      this.tasks.delete(key);
    }

    const folderPath = path.join(this.outputDir, key);
    if (await fileExists(folderPath)) {
      await fsp.rm(folderPath, { recursive: true, force: true });
    }

    return {
      deleted: true,
      taskId: key,
      path: folderPath,
    };
  }

  async deleteAllTasks() {
    const running = Array.from(this.tasks.values()).find((task) => this.isTaskRunning(task));
    if (running) {
      throw new Error(`Task is running and cannot delete all: ${running.id}`);
    }

    if (await fileExists(this.outputDir)) {
      const entries = await fsp.readdir(this.outputDir, { withFileTypes: true });
      const folders = entries
        .filter((entry) => entry.isDirectory() && /^task-/u.test(entry.name))
        .map((entry) => path.join(this.outputDir, entry.name));
      for (const folderPath of folders) {
        await fsp.rm(folderPath, { recursive: true, force: true });
      }
    }

    this.tasks.clear();
    return {
      deleted: true,
      path: this.outputDir,
    };
  }

  async clearAllCache() {
    const running = Array.from(this.tasks.values()).find((task) => this.isTaskRunning(task));
    if (running) {
      throw new Error(`Task is running and cannot clear cache: ${running.id}`);
    }
    await fsp.rm(this.cacheDir, { recursive: true, force: true });
    await fsp.mkdir(this.cacheDir, { recursive: true });
    return {
      cleared: true,
      path: this.cacheDir,
    };
  }

  terminateProcessTree(task) {
    if (!task || !task.child || !task.pid) {
      return;
    }

    if (process.platform === "win32") {
      try {
        const killer = spawn("taskkill", ["/pid", String(task.pid), "/t", "/f"], {
          stdio: "ignore",
          shell: false,
        });
        killer.on("error", (err) => {
          this.appendTaskLine(task, "stderr", `taskkill failed: ${err && err.message ? err.message : String(err)}`);
          try {
            task.child.kill("SIGKILL");
          } catch {
            // Ignore fallback failure.
          }
        });
      } catch (err) {
        this.appendTaskLine(task, "stderr", `taskkill spawn failed: ${err && err.message ? err.message : String(err)}`);
        try {
          task.child.kill("SIGKILL");
        } catch {
          // Ignore fallback failure.
        }
      }
      return;
    }

    try {
      task.child.kill("SIGTERM");
    } catch (err) {
      this.appendTaskLine(task, "stderr", `SIGTERM failed: ${err && err.message ? err.message : String(err)}`);
    }

    setTimeout(() => {
      const current = this.tasks.get(task.id);
      if (!current || current.status !== "stopping" || !current.child) {
        return;
      }
      try {
        current.child.kill("SIGKILL");
      } catch {
        // Ignore fallback failure.
      }
    }, 3000);
  }

  stopTask(taskId) {
    const key = String(taskId || "");
    if (!this.tasks.has(key)) {
      return null;
    }

    const task = this.tasks.get(key);
    if (!task) {
      return null;
    }
    if (task.status !== "running" || !task.child) {
      return toTaskSummary(task);
    }

    task.stopRequested = true;
    task.status = "stopping";
    this.appendTaskLine(task, "stderr", `Stop requested by user (pid=${task.pid}).`);
    this.terminateProcessTree(task);

    return toTaskSummary(task);
  }

  startTask(options) {
    const configPath = resolveInsideProject(this.projectRoot, options && options.configPath, "config.toml");
    const workspacePath = options && options.workspacePath ? String(options.workspacePath) : "";
    const migrateWorkspace = !!(options && options.migrateWorkspace);

    const modes = {
      morpheCliOnly: !!(options && options.morpheCliOnly),
      downloadOnly: !!(options && options.downloadOnly),
      patchesOnly: !!(options && options.patchesOnly),
      dryRun: !!(options && options.dryRun),
      force: !!(options && options.force),
    };
    const persistLogs = options && Object.prototype.hasOwnProperty.call(options, "persistLogs")
      ? !!options.persistLogs
      : true;
    const exclusiveModes = [modes.morpheCliOnly, modes.downloadOnly, modes.patchesOnly].filter(Boolean).length;
    if (exclusiveModes > 1) {
      throw new Error("Options morpheCliOnly/downloadOnly/patchesOnly are mutually exclusive.");
    }

    const spawned = spawnCliTask(this.projectRoot, {
      configPath,
      workspacePath,
      migrateWorkspace,
      ...modes,
      noTaskLog: !persistLogs,
    }, {
      onLine: ({ stream, line }) => {
        const task = this.tasks.get(spawned.taskId);
        if (!task) return;
        this.appendTaskLine(task, stream, line);
      },
      onTaskOutputDir: (resolvedPath) => {
        const task = this.tasks.get(spawned.taskId);
        if (!task) return;
        task.taskOutputDir = resolvedPath;
        task.taskFolderName = path.basename(resolvedPath);
      },
      onTaskLogPath: (resolvedPath) => {
        const task = this.tasks.get(spawned.taskId);
        if (!task) return;
        task.taskLogPath = resolvedPath;
      },
    });

    const taskRecord = {
      id: spawned.taskId,
      source: "live",
      status: "running",
      pid: spawned.child.pid,
      exitCode: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      configPath,
      modes,
      taskOutputDir: null,
      taskFolderName: null,
      taskLogPath: null,
      args: spawned.args,
      persistLogs,
      stopRequested: false,
      child: spawned.child,
      workspacePath,
      lines: [],
    };

    this.tasks.set(spawned.taskId, taskRecord);

    spawned.child.on("error", (err) => {
      const task = this.tasks.get(spawned.taskId);
      if (!task) return;
      task.status = "failed";
      task.finishedAt = new Date().toISOString();
      task.exitCode = -1;
      this.appendTaskLine(task, "stderr", err && err.message ? err.message : String(err));
    });

    spawned.child.on("close", (code) => {
      const task = this.tasks.get(spawned.taskId);
      if (!task) return;
      task.exitCode = typeof code === "number" ? code : -1;
      if (task.stopRequested) {
        task.status = "canceled";
      } else {
        task.status = code === 0 ? "completed" : "failed";
      }
      task.finishedAt = new Date().toISOString();
      task.child = null;
    });

    return toTaskSummary(taskRecord);
  }
}

module.exports = {
  TaskService,
};
