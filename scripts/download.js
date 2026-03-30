"use strict";

const path = require("path");
const { URL } = require("url");
const { resolveApkMirrorDownloadUrl } = require("./download-apk/apkmirror");
const { resolveUptodownDownloadUrl } = require("./download-apk/uptodown");

function isHttpUrl(value) {
  return /^https?:\/\//iu.test(String(value || "").trim());
}

function resolveApkSource(apkFieldValue, appName) {
  const raw = String(apkFieldValue || "").trim();
  const lowered = raw.toLowerCase();

  if (!raw) {
    throw new Error(`[${appName}] apk field is empty.`);
  }
  if (lowered === "local") {
    return { mode: "local", value: raw };
  }
  if (isHttpUrl(raw)) {
    let parsed = null;
    try {
      parsed = new URL(raw);
    } catch {
      return { mode: "direct-url", value: raw };
    }
    const host = parsed.host.toLowerCase();
    const pathValue = parsed.pathname.toLowerCase();

    if (host.includes("apkmirror.com")) {
      if (pathValue.includes("download.php")) {
        return { mode: "direct-url", value: raw };
      }
      return { mode: "provider", provider: "apkmirror", inferredBaseUrl: raw };
    }
    if (host.includes("uptodown.com")) {
      if (host.startsWith("dw.") || pathValue.includes("/dwn/")) {
        return { mode: "direct-url", value: raw };
      }
      return { mode: "provider", provider: "uptodown", inferredBaseUrl: raw };
    }
    return { mode: "direct-url", value: raw };
  }
  if (lowered === "apkmirror" || lowered === "uptodown") {
    return { mode: "provider", provider: lowered };
  }

  throw new Error(
    `[${appName}] unsupported apk value: ${raw}. ` +
      "Use one of: local | apkmirror | uptodown | https://...",
  );
}

function resolveLocalApkPath(app, appName, configDir, ctx) {
  const customPath = ctx.pickFirstValue(app, [
    "local_apk",
    "local-apk",
    "source_apk",
    "source-apk",
    "apk_path",
    "apk-path",
  ]);
  if (customPath) {
    return ctx.resolveAbsolutePath(customPath, configDir);
  }
  return ctx.resolveAbsolutePath(`source-apk/${ctx.safeFileName(appName)}.apk`, configDir);
}

async function resolveDownloadInfo(app, appName, apkSource, targetVersion, strictVersion, ctx) {
  if (apkSource.mode === "direct-url") {
    return {
      downloadUrl: apkSource.value,
      resolvedVersion: targetVersion || null,
    };
  }
  if (apkSource.mode !== "provider") {
    throw new Error(`[${appName}] resolveDownloadInfo only supports provider/direct-url mode.`);
  }

  const provider = apkSource.provider;
  const appForProvider = { ...app };
  if (apkSource.inferredBaseUrl) {
    if (provider === "uptodown") {
      const hasUptodownBase =
        ctx.hasValue(appForProvider.app_url) ||
        ctx.hasValue(appForProvider["app-url"]) ||
        ctx.hasValue(appForProvider.uptodown_dlurl) ||
        ctx.hasValue(appForProvider["uptodown-dlurl"]);
      if (!hasUptodownBase) {
        appForProvider.app_url = apkSource.inferredBaseUrl;
      }
    } else if (provider === "apkmirror") {
      const hasApkMirrorBase =
        ctx.hasValue(appForProvider.release_url) ||
        ctx.hasValue(appForProvider["release-url"]) ||
        ctx.hasValue(appForProvider.apkmirror_dlurl) ||
        ctx.hasValue(appForProvider["apkmirror-dlurl"]);
      if (!hasApkMirrorBase) {
        appForProvider.apkmirror_dlurl = apkSource.inferredBaseUrl;
      }
    }
  }

  const providerCtx = {
    pickFirstValue: ctx.pickFirstValue,
    hasValue: ctx.hasValue,
    toAbsoluteUrl: ctx.toAbsoluteUrl,
    getHrefMatches: ctx.getHrefMatches,
    selectBestByVersion: ctx.selectBestByVersion,
    runCurl: ctx.runCurl,
    logInfo: ctx.logInfo,
    logWarn: ctx.logWarn,
  };
  const opts = { targetVersion, strictVersion };

  if (provider === "apkmirror") {
    return resolveApkMirrorDownloadUrl(appForProvider, appName, opts, providerCtx);
  }
  if (provider === "uptodown") {
    return resolveUptodownDownloadUrl(appForProvider, appName, opts, providerCtx);
  }
  throw new Error(`[${appName}] unsupported apk provider: ${provider} (allowed: apkmirror, uptodown)`);
}

async function resolveApk(params) {
  const {
    app,
    appName,
    apkSource,
    versionCandidates,
    downloadDir,
    configDir,
    options,
    ctx,
  } = params;

  const isLocalMode = apkSource.mode === "local";
  const directDlurl = ctx.pickFirstValue(app, [
    "download_url",
    "download-url",
    "direct_dlurl",
    "direct-dlurl",
  ]);
  const localApkPath = isLocalMode ? resolveLocalApkPath(app, appName, configDir, ctx) : null;

  let selectedApkPath = null;
  let selectedVersion = null;
  const attemptErrors = [];

  for (const candidate of versionCandidates) {
    const versionLabel = candidate.version || (isLocalMode ? "local" : "provider-default");
    ctx.logStep(`Processing [${appName}] (${versionLabel})`);

    try {
      if (isLocalMode) {
        if (options.dryRun) {
          ctx.logInfo(`DryRun: would use local APK ${localApkPath}`);
          selectedApkPath = localApkPath;
          selectedVersion = candidate.version || "local";
          break;
        }
        if (!(await ctx.fileExists(localApkPath))) {
          throw new Error(
            `[${appName}] local APK not found: ${localApkPath}. ` +
              "Put APK in source-apk/<app>.apk or set local_apk in config.",
          );
        }
        ctx.logInfo(`Using local APK: ${localApkPath}`);
        selectedApkPath = localApkPath;
        selectedVersion = candidate.version || "local";
        break;
      }

      let downloadInfo = null;
      if (options.dryRun && apkSource.mode === "provider" && !directDlurl) {
        ctx.logWarn(
          `DryRun: skip online provider resolve for [${appName}] (${versionLabel}). ` +
            "Set download_url or use apk as direct URL for exact dry-run URL.",
        );
        downloadInfo = {
          downloadUrl: "<provider-resolve-skipped>",
          resolvedVersion: candidate.version || null,
        };
      } else {
        downloadInfo = await resolveDownloadInfo(
          app,
          appName,
          apkSource,
          candidate.version,
          candidate.strictVersion,
          ctx,
        );
        ctx.logInfo(`Resolved download URL: ${downloadInfo.downloadUrl}`);
      }

      const effectiveVersion = candidate.version || downloadInfo.resolvedVersion || "latest";
      const apkFileName = `${ctx.safeFileName(appName)}-${ctx.safeFileName(effectiveVersion)}.apk`;
      const apkPath = path.join(downloadDir, apkFileName);

      if (options.dryRun) {
        ctx.logInfo(`DryRun: would download to ${apkPath}`);
        selectedApkPath = apkPath;
        selectedVersion = effectiveVersion;
        break;
      }

      const apkExists = await ctx.fileExists(apkPath);
      if (apkExists && !options.force) {
        ctx.logWarn(`APK already exists, skip download: ${apkPath} (use --force to redownload)`);
      } else {
        await ctx.downloadFile(downloadInfo.downloadUrl, apkPath, "APK");
      }

      selectedApkPath = apkPath;
      selectedVersion = effectiveVersion;
      break;
    } catch (err) {
      const message = ctx.formatError(err);
      attemptErrors.push(`[${versionLabel}] ${message}`);
      ctx.logWarn(`[${appName}] candidate ${versionLabel} failed: ${message}`);
    }
  }

  if (!selectedApkPath) {
    const action = isLocalMode ? "prepare local APK" : "download APK";
    throw new Error(
      `[${appName}] Failed to ${action} for all version candidates.\n${attemptErrors.join("\n")}`,
    );
  }

  return {
    apkPath: selectedApkPath,
    version: selectedVersion,
    isLocalMode,
  };
}

module.exports = {
  resolveApkSource,
  resolveApk,
};
