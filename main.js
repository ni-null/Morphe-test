#!/usr/bin/env node
"use strict";

const fsp = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");
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

function uniqueValues(values) {
  return Array.from(new Set(values));
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

function parseConfiguredPatchNames(value) {
  if (Array.isArray(value)) {
    return uniqueValues(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0),
    );
  }
  const text = String(value || "").trim();
  if (!text) return [];
  return uniqueValues(
    text
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

async function resolveConfiguredPatchSelection(params) {
  const { app, appName, jarPath, patchPath, ctx } = params;
  const patchMode = String(pickFirstValue(app, ["patches_mode", "patches-mode"]) || "default")
    .trim()
    .toLowerCase();
  if (patchMode !== "custom") return null;

  const selectedPatchNames = parseConfiguredPatchNames(pickFirstValue(app, ["patches"]));
  if (selectedPatchNames.length === 0) {
    logWarn(`[${appName}] patches_mode=custom but patches is empty, fallback to default enabled set.`);
    return null;
  }

  const patchInfo = await mpp.listPatchEntries({
    app,
    appName,
    jarPath,
    patchPath,
    ctx,
  });
  const indexByLowerName = new Map(
    patchInfo.entries.map((entry) => [String(entry.name || "").trim().toLowerCase(), entry.index]),
  );
  const matchedIndices = [];
  const missingNames = [];
  for (const name of selectedPatchNames) {
    const key = name.toLowerCase();
    if (!indexByLowerName.has(key)) {
      missingNames.push(name);
      continue;
    }
    matchedIndices.push(indexByLowerName.get(key));
  }

  if (matchedIndices.length === 0) {
    logWarn(
      `[${appName}] patches_mode=custom but no patch names matched current patch bundle. ` +
        `Configured: ${selectedPatchNames.join(", ")}. Fallback to default enabled set.`,
    );
    return null;
  }
  if (missingNames.length > 0) {
    logWarn(`[${appName}] custom patches not found in current patch bundle: ${missingNames.join(", ")}`);
  }

  const deduped = uniqueValues(matchedIndices).sort((a, b) => a - b);
  return { exclusive: true, indices: deduped };
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
  const exclusiveModes = [options.morpheCliOnly, options.downloadOnly, options.patchesOnly].filter(Boolean).length;
  if (exclusiveModes > 1) {
    throw new Error("Options --morphe-cli, --download-only and --patches-only cannot be used together.");
  }
  const onlyClearCache =
    options.clearCache &&
    !options.morpheCliOnly &&
    !options.downloadOnly &&
    !options.patchesOnly;

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
        projectRoot: process.cwd(),
        workspaceDir: workspacePaths.root,
        preferWorkspaceKeystore: hasValue(options.workspacePath),
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
          ? [
              { version: String(app.ver).trim(), strictVersion: true, source: "config.ver" },
              { version: null, strictVersion: false, source: "download-only-provider-default" },
            ]
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

      const patchSelection = patchPath
        ? await resolveConfiguredPatchSelection({
            app,
            appName,
            jarPath,
            patchPath,
            ctx,
          })
        : null;
      if (patchSelection && patchSelection.exclusive) {
        logInfo(`[${appName}] Custom patch selection indices: ${patchSelection.indices.join(", ")}`);
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
