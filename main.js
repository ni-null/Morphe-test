#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");
const { StringDecoder } = require("string_decoder");
const morpheCli = require("./scripts/morphe-cli");
const mpp = require("./scripts/mpp");
const downloader = require("./scripts/download");
const { printUsage, parseArgs } = require("./utils/cli");
const {
  setLogFilePath,
  closeLogFile,
  appendLogRaw,
  logInfo,
  logWarn,
  logStep,
  logError,
} = require("./utils/logger");
const { resolveSigningConfig } = require("./utils/signing");
const {
  hasValue,
  pickFirstValue,
  resolveAbsolutePath,
  safeFileName,
  formatError,
} = require("./utils/common");
const { readTomlFile } = require("./utils/toml");
const { toAbsoluteUrl, getHrefMatches, selectBestByVersion } = require("./utils/url");
const { createRuntime } = require("./utils/runtime");
const {
  resolveWorkspaceRoot,
  buildWorkspacePaths,
  ensureWorkspaceDirs,
  migrateLegacyDirs,
} = require("./utils/workspace");

const DEFAULT_MORPHE_PATCHES_REPO = "MorpheApp/morphe-patches";
const TASK_STATUS_COMPLETED_MARKER = "__TASK_STATUS__:completed";
const TASK_STATUS_FAILED_MARKER = "__TASK_STATUS__:failed";
const RESERVED_SECTIONS = new Set(["global", "patches", "morphe-cli", "morphe_cli"]);
const REMOVED_APP_KEYS = new Set([
  "apk",
  "app_url",
  "app-url",
  "download_url",
  "download-url",
  "release_url",
  "release-url",
]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function createTaskId(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `task-${y}${m}${d}-${hh}${mm}${ss}-${process.pid}`;
}

function createManualPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function askPrompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || "").trim()));
  });
}

function uniqueValues(values) {
  return Array.from(new Set(values));
}

function normalizeVersionCandidates(candidates) {
  return uniqueValues(
    (candidates || [])
      .map((item) => (item && hasValue(item.version) ? String(item.version).trim() : ""))
      .filter((value) => value.length > 0),
  );
}

function parsePatchIndexInput(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];
  const tokens = text.split(",").map((token) => token.trim()).filter(Boolean);
  const values = [];
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/u);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let i = min; i <= max; i += 1) {
        values.push(i);
      }
      continue;
    }
    if (!/^\d+$/u.test(token)) {
      throw new Error(`Invalid patch index token: ${token}`);
    }
    values.push(Number.parseInt(token, 10));
  }
  return uniqueValues(values);
}

function loadManualPlan(options) {
  if (options && hasValue(options.manualPlanPath)) {
    const planPath = resolveAbsolutePath(String(options.manualPlanPath).trim(), process.cwd());
    const raw = require("fs").readFileSync(planPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid manual plan JSON: root object required.");
    }
    return parsed;
  }

  const rawB64 = String(process.env.MORPHE_MANUAL_PLAN_B64 || "").trim();
  if (!rawB64) return null;
  try {
    const rawJson = Buffer.from(rawB64, "base64").toString("utf8");
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("root object required");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse MORPHE_MANUAL_PLAN_B64: ${formatError(err)}`);
  }
}

function getAppManualSelection(manualPlan, appName) {
  if (!manualPlan || typeof manualPlan !== "object") return null;
  const apps = manualPlan.apps;
  if (!apps || typeof apps !== "object") return null;
  const direct = apps[appName];
  if (direct && typeof direct === "object") return direct;
  const lower = String(appName).toLowerCase();
  for (const [name, value] of Object.entries(apps)) {
    if (String(name).toLowerCase() === lower && value && typeof value === "object") {
      return value;
    }
  }
  return null;
}

async function askManualVersionSelection(rl, appName, versionCandidates) {
  const versions = normalizeVersionCandidates(versionCandidates);
  if (versions.length > 0) {
    console.log(`\n[${appName}] Compatible APK versions:`);
    versions.forEach((version, idx) => {
      console.log(`  ${idx + 1}. ${version}`);
    });
    console.log("  0. provider default (auto)");
  } else {
    console.log(`\n[${appName}] No strict compatibility list found.`);
    console.log("  0. provider default (auto)");
  }

  while (true) {
    const answer = await askPrompt(rl, `[${appName}] Select APK version (number or custom text, default 0): `);
    if (!answer || answer === "0") {
      return { version: null, strictVersion: false, source: "manual-auto" };
    }
    if (/^\d+$/u.test(answer)) {
      const index = Number.parseInt(answer, 10) - 1;
      if (index >= 0 && index < versions.length) {
        return { version: versions[index], strictVersion: true, source: "manual-compatibility-list" };
      }
      console.log("Invalid index. Please retry.");
      continue;
    }
    return { version: answer, strictVersion: true, source: "manual-custom" };
  }
}

async function askManualPatchSelection(rl, appName, patchEntries) {
  if (!Array.isArray(patchEntries) || patchEntries.length === 0) {
    return null;
  }

  console.log(`\n[${appName}] Available patches:`);
  patchEntries.forEach((item) => {
    const flag = item.enabled ? "[default:on]" : "[default:off]";
    console.log(`  ${item.index}. ${item.name} ${flag}`);
  });
  console.log("  Input rules: empty=use default set, *=enable all, 1,2,9-12=custom indices");

  const allowed = new Set(patchEntries.map((item) => item.index));
  while (true) {
    const answer = await askPrompt(rl, `[${appName}] Select patch indices: `);
    if (!answer) {
      return null;
    }
    if (answer === "*") {
      return { exclusive: true, indices: patchEntries.map((item) => item.index) };
    }

    let indices = [];
    try {
      indices = parsePatchIndexInput(answer);
    } catch (err) {
      console.log(formatError(err));
      continue;
    }
    const invalid = indices.filter((index) => !allowed.has(index));
    if (invalid.length > 0) {
      console.log(`Invalid indices: ${invalid.join(", ")}.`);
      continue;
    }
    return { exclusive: true, indices };
  }
}

function runWebMode(projectRoot) {
  return new Promise((resolve, reject) => {
    const launcherPath = path.join(projectRoot, "scripts", "web", "start-dev.js");
    const child = spawn(process.execPath, [launcherPath], {
      cwd: projectRoot,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start web mode: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Web mode exited with code ${code}`));
    });
  });
}

function runJavaPatch(jarPath, patchPath, apkPath, outputDir, appName, signingConfig, patchSelection) {
  return new Promise((resolve, reject) => {
    const utf8Flags = "-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8";
    const javaToolOptions = [process.env.JAVA_TOOL_OPTIONS, utf8Flags].filter(Boolean).join(" ").trim();
    const childEnv = {
      ...process.env,
      JAVA_TOOL_OPTIONS: javaToolOptions,
    };

    const args = ["-jar", jarPath, "patch", "--patches", patchPath];
    if (patchSelection && patchSelection.exclusive && Array.isArray(patchSelection.indices)) {
      args.push("--exclusive");
      for (const index of patchSelection.indices) {
        args.push("--ei", String(index));
      }
    }
    if (signingConfig) {
      args.push(`--keystore=${signingConfig.keystorePath}`);
      if (hasValue(signingConfig.storePassword)) {
        args.push(`--keystore-password=${signingConfig.storePassword}`);
      }
      if (hasValue(signingConfig.entryAlias)) {
        args.push(`--keystore-entry-alias=${signingConfig.entryAlias}`);
      }
      if (hasValue(signingConfig.entryPassword)) {
        args.push(`--keystore-entry-password=${signingConfig.entryPassword}`);
      }
    }
    args.push(apkPath);
    const child = spawn("java", args, {
      cwd: outputDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: childEnv,
    });

    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    child.stdout.on("data", (chunk) => {
      const text = stdoutDecoder.write(chunk);
      if (text) {
        appendLogRaw(text, "PATCH_STDOUT");
        process.stdout.write(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = stderrDecoder.write(chunk);
      if (text) {
        appendLogRaw(text, "PATCH_STDERR");
        process.stderr.write(text);
      }
    });

    child.on("error", (err) => reject(new Error(`Failed to start java for [${appName}]: ${err.message}`)));
    child.on("close", (code) => {
      const stdoutTail = stdoutDecoder.end();
      const stderrTail = stderrDecoder.end();
      if (stdoutTail) {
        appendLogRaw(stdoutTail, "PATCH_STDOUT");
        process.stdout.write(stdoutTail);
      }
      if (stderrTail) {
        appendLogRaw(stderrTail, "PATCH_STDERR");
        process.stderr.write(stderrTail);
      }
      if (code !== 0) {
        reject(new Error(`morphe-cli returned exit code ${code} for [${appName}]`));
        return;
      }
      resolve();
    });
  });
}

async function findPatchedApkFile(outputDir, apkPath, runtime) {
  const apkBase = path.basename(apkPath, path.extname(apkPath));
  const expected = path.join(outputDir, `${apkBase}-patched.apk`);
  if (await runtime.fileExists(expected)) {
    return expected;
  }

  const entries = await fsp.readdir(outputDir, { withFileTypes: true });
  const apkPaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".apk"))
    .map((entry) => path.join(outputDir, entry.name));
  if (apkPaths.length === 0) {
    return null;
  }
  if (apkPaths.length === 1) {
    return apkPaths[0];
  }

  const ranked = await Promise.all(
    apkPaths.map(async (apkFile) => ({
      apkFile,
      stat: await fsp.stat(apkFile),
    })),
  );
  ranked.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return ranked[0].apkFile;
}

function buildPatchedApkName(appName, apkVersion, patchPath) {
  const appLabel = safeFileName(appName);
  const versionLabel = safeFileName(hasValue(apkVersion) ? String(apkVersion).trim() : "unknown");
  const patchLabel = safeFileName(path.basename(patchPath, path.extname(patchPath)));
  return `morphe-${appLabel}-${versionLabel}-${patchLabel}.apk`;
}

async function runPatchFlow(params) {
  const {
    jarPath,
    patchPath,
    apkPath,
    apkVersion,
    outputDir,
    appName,
    runtime,
    signingConfig,
    patchSelection,
  } = params;

  if (!(await runtime.fileExists(jarPath))) {
    throw new Error(`morphe-cli jar not found: ${jarPath}`);
  }
  if (!(await runtime.fileExists(patchPath))) {
    throw new Error(`Patch file not found for [${appName}]: ${patchPath}`);
  }
  if (!(await runtime.fileExists(apkPath))) {
    throw new Error(`APK not found for [${appName}]: ${apkPath}`);
  }

  await runtime.ensureDir(outputDir);
  const apkBase = path.basename(apkPath, path.extname(apkPath));
  const tempDir = path.join(outputDir, `${apkBase}-patched-temporary-files`);
  if (await runtime.fileExists(tempDir)) {
    logWarn(`Removing stale morphe temp directory: ${tempDir}`);
    await runtime.removeDirRecursive(tempDir);
  }

  try {
    logStep(`Patching [${appName}] with morphe-cli`);
    await runJavaPatch(jarPath, patchPath, apkPath, outputDir, appName, signingConfig, patchSelection);

    const patchedSource = await findPatchedApkFile(outputDir, apkPath, runtime);
    if (!patchedSource) {
      throw new Error(`Patched APK not found in output directory: ${outputDir}`);
    }

    const renamedName = buildPatchedApkName(appName, apkVersion, patchPath);
    const renamedPath = path.join(outputDir, renamedName);
    if (path.normalize(patchedSource) !== path.normalize(renamedPath)) {
      if (await runtime.fileExists(renamedPath)) {
        await fsp.unlink(renamedPath);
      }
      await fsp.rename(patchedSource, renamedPath);
    }
    logInfo(`Patched APK saved: ${renamedPath}`);
    return renamedPath;
  } finally {
    if (await runtime.fileExists(tempDir)) {
      logInfo(`Cleanup morphe temp directory: ${tempDir}`);
      await runtime.removeDirRecursive(tempDir);
    }
  }
}

function buildContext(runtime) {
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
    logInfo,
    logWarn,
    logStep,
    defaultPatchesRepo: DEFAULT_MORPHE_PATCHES_REPO,
  };
}

function assertNoRemovedAppKeys(config, appNames) {
  for (const appName of appNames) {
    const app = config[appName] || {};
    const matched = Object.keys(app).filter((key) => REMOVED_APP_KEYS.has(String(key).trim()));
    if (matched.length === 0) {
      continue;
    }
    throw new Error(
      `[${appName}] removed config key(s): ${matched.join(", ")}. ` +
        "Use [app].mode = \"remote\" | \"local\" | false and provider keys: apkmirror-dlurl / uptodown-dlurl / archive-dlurl.",
    );
  }
}

async function clearWorkspaceCache(workspacePaths) {
  await ensureWorkspaceDirs(workspacePaths);
  await fsp.rm(workspacePaths.cache, { recursive: true, force: true });
  await fsp.mkdir(workspacePaths.cache, { recursive: true });
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const manualPlan = loadManualPlan(options);
  const manualActive = !!(options.manual || manualPlan);
  const exclusiveModes = [options.web, options.morpheCliOnly, options.downloadOnly, options.patchesOnly].filter(Boolean).length;
  if (exclusiveModes > 1) {
    throw new Error("Options --web, --morphe-cli, --download-only and --patches-only cannot be used together.");
  }
  if (manualActive && (options.web || options.morpheCliOnly || options.downloadOnly || options.patchesOnly)) {
    throw new Error("Option --manual cannot be used with --web, --morphe-cli, --download-only or --patches-only.");
  }
  if (options.manual && !manualPlan && !process.stdin.isTTY) {
    throw new Error("Option --manual requires an interactive terminal (TTY).");
  }
  if (options.web && (options.dryRun || options.force)) {
    throw new Error("Option --web cannot be used with --dry-run or --force.");
  }
  const onlyClearCache =
    options.clearCache &&
    !options.web &&
    !manualActive &&
    !options.morpheCliOnly &&
    !options.downloadOnly &&
    !options.patchesOnly;
  if (options.web) {
    if (options.clearCache) {
      const webWorkspaceRoot = resolveWorkspaceRoot({
        cliWorkspace: options.workspacePath,
        envWorkspace: process.env.MORPHE_WORKSPACE,
        cwd: process.cwd(),
        env: process.env,
      });
      const webWorkspacePaths = buildWorkspacePaths(webWorkspaceRoot);
      await clearWorkspaceCache(webWorkspacePaths);
      logInfo(`Workspace cache cleared: ${webWorkspacePaths.cache}`);
    }
    logInfo("Starting web console (web-api + web-ui)...");
    await runWebMode(process.cwd());
    return;
  }

  const configFull = resolveAbsolutePath(options.configPath, process.cwd());
  const configDir = path.dirname(configFull);
  const bootstrapWorkspaceRoot = resolveWorkspaceRoot({
    cliWorkspace: options.workspacePath,
    envWorkspace: process.env.MORPHE_WORKSPACE,
    cwd: process.cwd(),
    env: process.env,
  });
  const bootstrapWorkspacePaths = buildWorkspacePaths(bootstrapWorkspaceRoot);
  const bootstrapRuntime = createRuntime({
    cookieJarPath: path.join(bootstrapWorkspacePaths.downloads, ".morphe-cookie.txt"),
    cacheDir: bootstrapWorkspacePaths.cache,
    logStep,
  });
  const config = await readTomlFile(configFull, bootstrapRuntime.fileExists);
  const globalCfg = config.global || {};
  const workspaceRoot = resolveWorkspaceRoot({
    cliWorkspace: options.workspacePath,
    envWorkspace: process.env.MORPHE_WORKSPACE,
    configWorkspace: pickFirstValue(globalCfg, ["workspace"]),
    cwd: process.cwd(),
    env: process.env,
  });
  const workspacePaths = buildWorkspacePaths(workspaceRoot);
  await ensureWorkspaceDirs(workspacePaths);
  if (options.migrateWorkspace) {
    await migrateLegacyDirs(process.cwd(), workspacePaths, logInfo);
  }
  if (options.clearCache) {
    await clearWorkspaceCache(workspacePaths);
    logInfo(`Workspace cache cleared: ${workspacePaths.cache}`);
    if (onlyClearCache) {
      return;
    }
  }

  const outputRootDir = workspacePaths.output;
  const taskId = createTaskId();
  const taskOutputDir = path.join(outputRootDir, taskId);
  const shouldPersistTaskLog = !options.noTaskLog;
  const taskLogPath = shouldPersistTaskLog ? path.join(taskOutputDir, "task.log") : null;
  if (shouldPersistTaskLog) {
    await fsp.mkdir(taskOutputDir, { recursive: true });
    setLogFilePath(taskLogPath);
  }
  logInfo(`Config: ${configFull}`);
  if (shouldPersistTaskLog) {
    logInfo(`Task output directory: ${taskOutputDir}`);
    logInfo(`Task log file: ${taskLogPath}`);
  } else {
    logInfo("Task persistence disabled: --no-task-log");
  }
  logInfo(`Workspace: ${workspacePaths.root}`);

  const morpheCliCfg = config["morphe-cli"] || config.morphe_cli || {};
  const patchesCfg = config.patches || {};
  const downloadDir = workspacePaths.downloads;

  const runtime = createRuntime({
    cookieJarPath: path.join(downloadDir, ".morphe-cookie.txt"),
    cacheDir: workspacePaths.cache,
    logStep,
  });
  await ensureWorkspaceDirs(workspacePaths);
  if (shouldPersistTaskLog) {
    await runtime.ensureDir(taskOutputDir);
  }

  if (shouldPersistTaskLog) {
    const runInfo = {
      taskId,
      startedAt: new Date().toISOString(),
      configPath: configFull,
      workspaceRoot: workspacePaths.root,
      taskOutputDir,
      taskLogPath,
      argv: process.argv.slice(2),
      modes: {
        morpheCliOnly: !!options.morpheCliOnly,
        downloadOnly: !!options.downloadOnly,
        patchesOnly: !!options.patchesOnly,
        manual: manualActive,
        dryRun: !!options.dryRun,
        force: !!options.force,
      },
    };
    const runInfoPath = path.join(taskOutputDir, "task-info.json");
    await fsp.writeFile(runInfoPath, `${JSON.stringify(runInfo, null, 2)}\n`, "utf8");
    logInfo(`Task info saved: ${runInfoPath}`);
  }

  const allSections = Object.keys(config);
  const ignoredSections = allSections.filter((name) => RESERVED_SECTIONS.has(String(name).toLowerCase()));
  if (ignoredSections.length > 0) {
    logInfo(`Ignore reserved sections: ${ignoredSections.join(", ")}`);
  }

  const ctx = buildContext(runtime);
  if (options.morpheCliOnly) {
    const jarPath = await morpheCli.resolveMorpheCliJar({
      configDir,
      workspaceDir: workspacePaths.root,
      morpheCliCfg,
      dryRun: options.dryRun,
      force: options.force,
      ctx,
    });
    logInfo(`[morphe-cli] Jar ready: ${jarPath}`);
    console.log("\nAll tasks finished.");
    return;
  }

  const appNames = allSections.filter((name) => !RESERVED_SECTIONS.has(String(name).toLowerCase()));
  if (appNames.length === 0) {
    throw new Error("No app section found. Please add at least one app, e.g. [youtube].");
  }
  assertNoRemovedAppKeys(config, appNames);

  const requiresCliJar = !options.downloadOnly && !options.patchesOnly;
  const jarPath = requiresCliJar
    ? await morpheCli.resolveMorpheCliJar({
        configDir,
        workspaceDir: workspacePaths.root,
        morpheCliCfg,
        dryRun: options.dryRun,
        force: options.force,
        ctx,
      })
    : null;
  const signingConfig = requiresCliJar
    ? await resolveSigningConfig({
        configDir,
        runtime,
        dryRun: options.dryRun,
        env: process.env,
        logInfo,
      })
    : null;
  const shouldEmitReleaseMetadata =
    shouldPersistTaskLog &&
    !options.morpheCliOnly &&
    !options.downloadOnly &&
    !options.patchesOnly &&
    !options.dryRun;
  const releaseMetadata = shouldEmitReleaseMetadata
    ? {
        generatedAt: new Date().toISOString(),
        taskId,
        taskOutputDir,
        taskLogPath,
        configPath: configFull,
        morpheCli: jarPath
          ? {
              jarPath,
              fileName: path.basename(jarPath),
            }
          : null,
        signing:
          signingConfig && signingConfig.keystorePath
            ? {
                keystorePath: signingConfig.keystorePath,
                alias: signingConfig.entryAlias,
                source: signingConfig.source,
              }
            : null,
        apps: [],
      }
    : null;

  const manualPrompt = options.manual && !manualPlan ? createManualPrompt() : null;
  try {
    for (const appName of appNames) {
      const app = config[appName] || {};
      const appModeText = String(app.mode || "").trim().toLowerCase();
      if (app.mode === false || appModeText === "false") {
        logInfo(`[${appName}] mode=false, skip this app.`);
        continue;
      }
      if (options.patchesOnly) {
        const patchPath = await mpp.resolvePatchFile({
          app,
          appName,
          configDir,
          workspaceDir: workspacePaths.root,
          patchesCfg,
          dryRun: options.dryRun,
          force: options.force,
          ctx,
        });
        logInfo(`[${appName}] Patch file ready: ${patchPath}`);
        continue;
      }

      const apkSource = downloader.resolveApkSource(app.mode, appName);
      if (apkSource.mode === "skip") {
        logWarn(apkSource.reason);
        continue;
      }
      const isLocalMode = apkSource.mode === "local";
      let patchPath = null;
      if (!options.downloadOnly) {
        patchPath = await mpp.resolvePatchFile({
          app,
          appName,
          configDir,
          workspaceDir: workspacePaths.root,
          patchesCfg,
          dryRun: options.dryRun,
          force: options.force,
          ctx,
        });
      }

      let versionCandidates = null;
      if (isLocalMode) {
        versionCandidates = [
          {
            version: hasValue(app.ver) ? String(app.ver).trim() : null,
            strictVersion: false,
            source: "local",
          },
        ];
      } else if (options.downloadOnly) {
        versionCandidates = hasValue(app.ver)
          ? [{ version: String(app.ver).trim(), strictVersion: true, source: "config.ver" }]
          : [{ version: null, strictVersion: false, source: "download-only-provider-default" }];
      } else {
        versionCandidates = await mpp.resolveVersionCandidates({
          app,
          appName,
          jarPath,
          patchPath,
          dryRun: options.dryRun,
          ctx,
        });
      }

      if (manualActive && !isLocalMode) {
        const appManual = getAppManualSelection(manualPlan, appName);
        if (appManual && Object.prototype.hasOwnProperty.call(appManual, "version")) {
          const selectedValue = hasValue(appManual.version) ? String(appManual.version).trim() : null;
          versionCandidates = [{ version: selectedValue, strictVersion: !!selectedValue, source: "manual-plan" }];
          logInfo(
            hasValue(selectedValue)
              ? `[${appName}] Manual plan version selected: ${selectedValue}`
              : `[${appName}] Manual plan version selected: provider default`,
          );
        } else if (manualPrompt) {
          const selectedVersion = await askManualVersionSelection(manualPrompt, appName, versionCandidates);
          versionCandidates = [selectedVersion];
          if (hasValue(selectedVersion.version)) {
            logInfo(`[${appName}] Manual version selected: ${selectedVersion.version}`);
          } else {
            logInfo(`[${appName}] Manual version selected: provider default`);
          }
        }
      }

      const apkResult = await downloader.resolveApk({
        app,
        appName,
        apkSource,
        versionCandidates,
        downloadDir,
        configDir,
        options,
        ctx,
      });

      if (options.downloadOnly) {
        if (apkResult.isLocalMode) {
          logInfo(`[${appName}] Local APK ready: ${apkResult.apkPath}`);
        } else {
          const providerText = apkResult.provider ? ` provider=${apkResult.provider}` : "";
          logInfo(`[${appName}] Download completed with version: ${apkResult.version}${providerText}`);
        }
        continue;
      }

      if (options.dryRun) {
        logInfo(`DryRun: would run patch with patch file ${patchPath}`);
        continue;
      }

      let patchSelection = null;
      if (manualActive && patchPath) {
        const patchInfo = await mpp.listPatchEntries({
          app,
          appName,
          jarPath,
          patchPath,
          ctx,
        });
        const appManual = getAppManualSelection(manualPlan, appName);
        if (appManual && Array.isArray(appManual.patchIndices)) {
          const allowed = new Set(patchInfo.entries.map((entry) => entry.index));
          const filtered = Array.from(
            new Set(
              appManual.patchIndices
                .map((value) => Number.parseInt(String(value), 10))
                .filter((value) => Number.isInteger(value) && allowed.has(value)),
            ),
          );
          patchSelection = { exclusive: true, indices: filtered };
        } else if (manualPrompt) {
          patchSelection = await askManualPatchSelection(manualPrompt, appName, patchInfo.entries);
        }
        if (patchSelection && patchSelection.exclusive) {
          logInfo(`[${appName}] Manual patch selection indices: ${patchSelection.indices.join(", ")}`);
        } else {
          logInfo(`[${appName}] Manual patch selection: use default enabled set`);
        }
      }

      const outputApkPath = await runPatchFlow({
        jarPath,
        patchPath,
        apkPath: apkResult.apkPath,
        apkVersion: apkResult.version,
        outputDir: path.join(taskOutputDir, safeFileName(appName)),
        appName,
        runtime,
        signingConfig,
        patchSelection,
      });
      if (releaseMetadata) {
        releaseMetadata.apps.push({
          appName,
          apkVersion: apkResult.version,
          apkProvider: apkResult.provider || null,
          patchPath,
          patchFileName: path.basename(patchPath),
          outputApkPath,
        });
      }
    }

    if (releaseMetadata) {
      const metadataPath = path.join(taskOutputDir, "release-metadata.json");
      await fsp.writeFile(metadataPath, `${JSON.stringify(releaseMetadata, null, 2)}\n`, "utf8");
      logInfo(`Release metadata saved: ${metadataPath}`);
    }
  } finally {
    if (manualPrompt) {
      manualPrompt.close();
    }
  }

  logInfo(TASK_STATUS_COMPLETED_MARKER);
  console.log("\nAll tasks finished.");
}

async function main() {
  let exitCode = 0;
  try {
    await run();
  } catch (err) {
    logError(formatError(err));
    logError(TASK_STATUS_FAILED_MARKER);
    exitCode = 1;
  } finally {
    closeLogFile();
  }
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

main();
