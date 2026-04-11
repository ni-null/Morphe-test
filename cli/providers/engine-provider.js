"use strict";

const { spawn } = require("child_process");
const { StringDecoder } = require("string_decoder");
const engineCli = require("../../scripts/engine-cli");
const mpp = require("../../scripts/mpp");

const provider = {
  id: "engine",
  defaultPatchesRepo: "MorpheApp/morphe-patches",

  async resolveCliJar(params) {
    const {
      configDir,
      workspaceDir,
      cliConfig,
      dryRun,
      force,
      ctx,
    } = params || {};
    return engineCli.resolveEngineCliJar({
      configDir,
      workspaceDir,
      engineCliCfg: cliConfig || {},
      dryRun: !!dryRun,
      force: !!force,
      ctx,
    });
  },

  async resolvePatchFile(params) {
    const {
      app,
      appName,
      configDir,
      workspaceDir,
      patchConfig,
      dryRun,
      force,
      ctx,
    } = params || {};
    return mpp.resolvePatchFile({
      app,
      appName,
      configDir,
      workspaceDir,
      patchesCfg: patchConfig || {},
      dryRun: !!dryRun,
      force: !!force,
      ctx,
    });
  },

  async listPatchEntries(params) {
    return mpp.listPatchEntries(params || {});
  },

  async listCompatibleVersionsRaw(params) {
    return mpp.listCompatibleVersionsRaw(params || {});
  },

  async listPatchEntriesRaw(params) {
    return mpp.listPatchEntriesRaw(params || {});
  },

  async resolveVersionCandidates(params) {
    return mpp.resolveVersionCandidates(params || {});
  },

  resolveCompatibleVersionsFromRaw(rawText, appName, configuredPackageName) {
    return mpp.resolveCompatibleVersionsFromRaw(rawText, appName, configuredPackageName);
  },

  parsePatchEntries(rawText) {
    return mpp.parsePatchEntries(rawText);
  },

  mergePatchEntries(withOptionsEntries, defaultEntries) {
    return mpp.mergePatchEntries(withOptionsEntries, defaultEntries);
  },

  async runPatchCommand(params) {
    const {
      appName,
      jarPath,
      patchPath,
      apkPath,
      outputDir,
      signingConfig,
      patchSelection,
      onStdout,
      onStderr,
    } = params || {};

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
        if (signingConfig.storePassword != null && String(signingConfig.storePassword).length > 0) {
          args.push(`--keystore-password=${signingConfig.storePassword}`);
        }
        if (signingConfig.entryAlias != null && String(signingConfig.entryAlias).length > 0) {
          args.push(`--keystore-entry-alias=${signingConfig.entryAlias}`);
        }
        if (signingConfig.entryPassword != null && String(signingConfig.entryPassword).length > 0) {
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
        if (text && typeof onStdout === "function") onStdout(text);
      });
      child.stderr.on("data", (chunk) => {
        const text = stderrDecoder.write(chunk);
        if (text && typeof onStderr === "function") onStderr(text);
      });

      child.on("error", (err) => reject(new Error(`Failed to start java for [${appName}]: ${err.message}`)));
      child.on("close", (code) => {
        const stdoutTail = stdoutDecoder.end();
        const stderrTail = stderrDecoder.end();
        if (stdoutTail && typeof onStdout === "function") onStdout(stdoutTail);
        if (stderrTail && typeof onStderr === "function") onStderr(stderrTail);
        if (code !== 0) {
          reject(new Error(`engine-cli returned exit code ${code} for [${appName}]`));
          return;
        }
        resolve();
      });
    });
  },
};

module.exports = provider;
