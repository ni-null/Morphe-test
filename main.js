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
const { logInfo, logWarn, logStep, logError } = require("./utils/logger");
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

const DEFAULT_MORPHE_PATCHES_REPO = "MorpheApp/morphe-patches";
const DEFAULT_DOWNLOAD_DIR_REL = "./downloads";
const DEFAULT_OUTPUT_DIR_REL = "./output";
const RESERVED_SECTIONS = new Set(["global", "patches", "morphe-cli", "morphe_cli"]);

function runJavaPatch(jarPath, patchPath, apkPath, outputDir, appName, signingConfig) {
  return new Promise((resolve, reject) => {
    const utf8Flags = "-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8";
    const javaToolOptions = [process.env.JAVA_TOOL_OPTIONS, utf8Flags].filter(Boolean).join(" ").trim();
    const childEnv = {
      ...process.env,
      JAVA_TOOL_OPTIONS: javaToolOptions,
    };

    const args = ["-jar", jarPath, "patch", "--patches", patchPath];
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
        process.stdout.write(text);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = stderrDecoder.write(chunk);
      if (text) {
        process.stderr.write(text);
      }
    });

    child.on("error", (err) => reject(new Error(`Failed to start java for [${appName}]: ${err.message}`)));
    child.on("close", (code) => {
      const stdoutTail = stdoutDecoder.end();
      const stderrTail = stderrDecoder.end();
      if (stdoutTail) {
        process.stdout.write(stdoutTail);
      }
      if (stderrTail) {
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
    await runJavaPatch(jarPath, patchPath, apkPath, outputDir, appName, signingConfig);

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

  const configFull = resolveAbsolutePath(options.configPath, process.cwd());
  const configDir = path.dirname(configFull);
  logInfo(`Config: ${configFull}`);

  const cookieJarPath = path.join(configDir, "downloads", ".morphe-cookie.txt");
  const bootstrapRuntime = createRuntime({ cookieJarPath, logStep });
  const config = await readTomlFile(configFull, bootstrapRuntime.fileExists);

  const globalCfg = config.global || {};
  const morpheCliCfg = config["morphe-cli"] || config.morphe_cli || {};
  const patchesCfg = config.patches || {};
  const downloadDir = resolveAbsolutePath(DEFAULT_DOWNLOAD_DIR_REL, configDir);
  const outputDir = resolveAbsolutePath(DEFAULT_OUTPUT_DIR_REL, configDir);

  const runtime = createRuntime({
    cookieJarPath: path.join(downloadDir, ".morphe-cookie.txt"),
    logStep,
  });
  await runtime.ensureDir(downloadDir);
  await runtime.ensureDir(outputDir);

  const allSections = Object.keys(config);
  const ignoredSections = allSections.filter((name) => RESERVED_SECTIONS.has(String(name).toLowerCase()));
  if (ignoredSections.length > 0) {
    logInfo(`Ignore reserved sections: ${ignoredSections.join(", ")}`);
  }

  const ctx = buildContext(runtime);
  if (options.morpheCliOnly) {
    const jarPath = await morpheCli.resolveMorpheCliJar({
      configDir,
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

  const requiresCliJar = !options.downloadOnly && !options.patchesOnly;
  const jarPath = requiresCliJar
    ? await morpheCli.resolveMorpheCliJar({
        configDir,
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
    !options.morpheCliOnly &&
    !options.downloadOnly &&
    !options.patchesOnly &&
    !options.dryRun;
  const releaseMetadata = shouldEmitReleaseMetadata
    ? {
        generatedAt: new Date().toISOString(),
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
    if (options.patchesOnly) {
      const patchPath = await mpp.resolvePatchFile({
        app,
        appName,
        configDir,
        globalCfg,
        patchesCfg,
        dryRun: options.dryRun,
        force: options.force,
        ctx,
      });
      logInfo(`[${appName}] Patch file ready: ${patchPath}`);
      continue;
    }

    const apkSource = downloader.resolveApkSource(app.apk, appName);
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
        globalCfg,
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
        logInfo(`[${appName}] Download completed with version: ${apkResult.version}`);
      }
      continue;
    }

    if (options.dryRun) {
      logInfo(`DryRun: would run patch with patch file ${patchPath}`);
      continue;
    }

    const outputApkPath = await runPatchFlow({
      jarPath,
      patchPath,
      apkPath: apkResult.apkPath,
      apkVersion: apkResult.version,
      outputDir: path.join(outputDir, safeFileName(appName)),
      appName,
      runtime,
      signingConfig,
    });
    if (releaseMetadata) {
      releaseMetadata.apps.push({
        appName,
        apkVersion: apkResult.version,
        patchPath,
        patchFileName: path.basename(patchPath),
        outputApkPath,
      });
    }
  }

  if (releaseMetadata) {
    const metadataPath = path.join(outputDir, "release-metadata.json");
    await fsp.writeFile(metadataPath, `${JSON.stringify(releaseMetadata, null, 2)}\n`, "utf8");
    logInfo(`Release metadata saved: ${metadataPath}`);
  }

  console.log("\nAll tasks finished.");
}

run().catch((err) => {
  logError(formatError(err));
  process.exit(1);
});
