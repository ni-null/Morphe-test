"use strict";

const path = require("path");
const fsp = require("fs").promises;
const { resolveApkMirrorDownloadUrl } = require("./download-apk/apkmirror");
const { resolveUptodownDownloadUrl } = require("./download-apk/uptodown");
const { resolveArchiveDownloadUrl } = require("./download-apk/archive");

const REMOTE_PROVIDER_ORDER = [ "apkmirror","uptodown","archive"];
const PROVIDER_MAX_RETRIES = 3;

function isCloudflareBlockedMessage(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("cloudflare") || text.includes("cf_clearance");
}

function resolveApkSource(modeValue, appName) {
  if (modeValue === false) {
    return {
      mode: "skip",
      reason: `[${appName}] mode=false, skip this app.`,
    };
  }

  const raw = String(modeValue || "").trim();
  const lowered = raw.toLowerCase();

  if (!raw) {
    return {
      mode: "skip",
      reason: `[${appName}] mode is not defined, expected remote/local/false. Skip this app.`,
    };
  }
  if (lowered === "false") {
    return {
      mode: "skip",
      reason: `[${appName}] mode=false, skip this app.`,
    };
  }
  if (lowered === "local") {
    return { mode: "local", value: raw };
  }
  if (lowered === "remote") {
    return {
      mode: "remote-fallback",
      providers: REMOTE_PROVIDER_ORDER,
    };
  }

  return {
    mode: "skip",
    reason: `[${appName}] invalid mode "${raw}", expected "remote", "local", or false. Skip this app.`,
  };
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

async function resolveProviderDownloadInfo(
  provider,
  app,
  appName,
  apkSource,
  targetVersion,
  strictVersion,
  destinationPath,
  forceDownload,
  ctx,
) {
  const appForProvider = { ...app, __section_name: appName };
  if (apkSource.inferredBaseUrl) {
    if (provider === "apkmirror") {
      const hasApkMirrorBase =
        ctx.hasValue(appForProvider.apkmirror_dlurl) ||
        ctx.hasValue(appForProvider["apkmirror-dlurl"]);
      if (!hasApkMirrorBase) {
        appForProvider.apkmirror_dlurl = apkSource.inferredBaseUrl;
      }
    } else if (provider === "archive") {
      const hasArchiveBase =
        ctx.hasValue(appForProvider.archive_url) ||
        ctx.hasValue(appForProvider["archive-url"]) ||
        ctx.hasValue(appForProvider.archive_dlurl) ||
        ctx.hasValue(appForProvider["archive-dlurl"]);
      if (!hasArchiveBase) {
        appForProvider.archive_url = apkSource.inferredBaseUrl;
      }
    }
  }

  const providerCtx = {
    pickFirstValue: ctx.pickFirstValue,
    hasValue: ctx.hasValue,
    formatError: ctx.formatError,
    toAbsoluteUrl: ctx.toAbsoluteUrl,
    getHrefMatches: ctx.getHrefMatches,
    selectBestByVersion: ctx.selectBestByVersion,
    runCurl: ctx.runCurl,
    runCommandCapture: ctx.runCommandCapture,
    ensureDir: ctx.ensureDir,
    logInfo: ctx.logInfo,
    logWarn: ctx.logWarn,
  };
  const opts = { targetVersion, strictVersion, destinationPath, force: !!forceDownload };

  if (provider === "apkmirror") {
    return resolveApkMirrorDownloadUrl(appForProvider, appName, opts, providerCtx);
  }
  if (provider === "uptodown") {
    return resolveUptodownDownloadUrl(appForProvider, appName, opts, providerCtx);
  }
  if (provider === "archive") {
    return resolveArchiveDownloadUrl(appForProvider, appName, opts, providerCtx);
  }
  throw new Error(`[${appName}] unsupported remote provider: ${provider}.`);
}

async function resolveDownloadInfo(
  app,
  appName,
  apkSource,
  targetVersion,
  strictVersion,
  destinationPath,
  forceDownload,
  ctx,
  state,
) {
  if (apkSource.mode !== "remote-fallback") {
    throw new Error(`[${appName}] resolveDownloadInfo only supports remote-fallback mode.`);
  }

  const providers = Array.isArray(apkSource.providers) && apkSource.providers.length > 0
    ? apkSource.providers
    : REMOTE_PROVIDER_ORDER;
  const disabledProviders = state && state.disabledProviders instanceof Set
    ? state.disabledProviders
    : new Set();

  const providerErrors = [];
  for (const provider of providers) {
    if (disabledProviders.has(provider)) {
      providerErrors.push(`[${provider}] skipped (disabled in this run)`);
      continue;
    }
    for (let attempt = 1; attempt <= PROVIDER_MAX_RETRIES; attempt += 1) {
      try {
        if (attempt > 1) {
          ctx.logWarn(`[${appName}] retry ${attempt}/${PROVIDER_MAX_RETRIES} for ${provider}`);
        }
        const info = await resolveProviderDownloadInfo(
          provider,
          app,
          appName,
          apkSource,
          targetVersion,
          strictVersion,
          destinationPath,
          forceDownload,
          ctx,
        );
        return { ...info, provider };
      } catch (err) {
        const message = ctx.formatError(err);
        providerErrors.push(`[${provider}#${attempt}] ${message}`);
        const cfBlocked = provider === "apkmirror" && isCloudflareBlockedMessage(message);
        if (cfBlocked) {
          disabledProviders.add(provider);
          ctx.logWarn(
            `[${appName}] ${provider} blocked by Cloudflare, skip remaining ${provider} retries and fallback.`,
          );
          break;
        }
        if (attempt < PROVIDER_MAX_RETRIES) {
          ctx.logWarn(`[${appName}] ${provider} attempt ${attempt} failed: ${message}`);
        }
      }
    }
  }

  throw new Error(
    `[${appName}] failed to resolve remote APK URL after retries.\n${providerErrors.join("\n")}`,
  );
}

function inferVersionFromApkPath(apkPath, appName, ctx) {
  const fileName = path.basename(String(apkPath || ""));
  const stem = fileName.replace(/\.apk$/iu, "");
  if (!stem) return "";
  const appPrefix = `${ctx.safeFileName(appName)}-`.toLowerCase();
  const lowerStem = stem.toLowerCase();
  const candidate = lowerStem.startsWith(appPrefix) ? stem.slice(appPrefix.length) : stem;
  const matched = candidate.match(/^([0-9]+(?:\.[0-9A-Za-z]+)+(?:[-._]?(?:dev|alpha|beta|rc)[-._]?[0-9A-Za-z]*)?)/iu);
  return matched ? String(matched[1] || "").trim() : "";
}

function resolveLocalVersionRule(versionCandidates) {
  const list = Array.isArray(versionCandidates) ? versionCandidates : [];
  const strictVersions = [];
  let allowAny = false;

  for (const candidate of list) {
    const version = candidate && candidate.version ? String(candidate.version).trim() : "";
    const strictVersion = !!(candidate && candidate.strictVersion);
    if (!strictVersion || !version) {
      allowAny = true;
      continue;
    }
    strictVersions.push(version);
  }

  const dedupStrictVersions = Array.from(
    new Set(
      strictVersions.map((version) => String(version || "").trim()).filter(Boolean),
    ),
  );
  if (dedupStrictVersions.length === 0) allowAny = true;

  return {
    allowAny,
    strictVersions: dedupStrictVersions,
    preferredVersion: dedupStrictVersions[0] || "",
  };
}

function validateLocalApkVersion(localVersion, versionRule, appName) {
  if (!versionRule || versionRule.allowAny) return;
  const expected = Array.isArray(versionRule.strictVersions) ? versionRule.strictVersions : [];
  const expectedLower = new Set(expected.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
  const normalizedLocalVersion = String(localVersion || "").trim().toLowerCase();

  if (!normalizedLocalVersion) {
    throw new Error(
      `[${appName}] Unable to infer local APK version from filename. ` +
        `Expected one of: ${expected.join(", ")}.`,
    );
  }

  if (!expectedLower.has(normalizedLocalVersion)) {
    throw new Error(
      `[${appName}] Local APK version (${localVersion}) is incompatible. ` +
        `Expected one of: ${expected.join(", ")}.`,
    );
  }
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
  const localApkPath = isLocalMode ? resolveLocalApkPath(app, appName, configDir, ctx) : null;

  if (isLocalMode) {
    const versionRule = resolveLocalVersionRule(versionCandidates);
    const localApkVersion = inferVersionFromApkPath(localApkPath, appName, ctx);

    if (options.dryRun) {
      validateLocalApkVersion(localApkVersion, versionRule, appName);
      ctx.logInfo(`DryRun: would use local APK ${localApkPath}`);
      if (localApkVersion) {
        ctx.logInfo(`DryRun: inferred local APK version ${localApkVersion}`);
      }
      return {
        apkPath: localApkPath,
        version: localApkVersion || versionRule.preferredVersion || "local",
        isLocalMode: true,
        provider: null,
      };
    }

    if (!(await ctx.fileExists(localApkPath))) {
      throw new Error(
        `[${appName}] local APK not found: ${localApkPath}. ` +
          "Set local_apk in config to a valid file path.",
      );
    }

    validateLocalApkVersion(localApkVersion, versionRule, appName);
    ctx.logInfo(`Using local APK: ${localApkPath}`);
    if (localApkVersion) {
      ctx.logInfo(`Using local APK version: ${localApkVersion}`);
    }
    return {
      apkPath: localApkPath,
      version: localApkVersion || versionRule.preferredVersion || "local",
      isLocalMode: true,
      provider: null,
    };
  }

  let selectedApkPath = null;
  let selectedVersion = null;
  let selectedProvider = null;
  const attemptErrors = [];
  const providerState = { disabledProviders: new Set() };

  for (const candidate of versionCandidates) {
    const versionLabel = candidate.version || "provider-default";
    ctx.logStep(`Processing [${appName}] (${versionLabel})`);

    try {
      const candidateVersion = ctx.hasValue(candidate.version)
        ? String(candidate.version).trim()
        : "";
      if (!options.force && candidateVersion) {
        const cachedFileName = `${ctx.safeFileName(appName)}-${ctx.safeFileName(candidateVersion)}.apk`;
        const cachedApkPath = path.join(downloadDir, cachedFileName);
        if (await ctx.fileExists(cachedApkPath)) {
          ctx.logInfo(
            `Use cached APK, skip provider resolve: ${cachedApkPath} (use --force to redownload)`,
          );
          selectedApkPath = cachedApkPath;
          selectedVersion = candidateVersion;
          break;
        }
      }

      let downloadInfo = null;
      const preResolvedVersion = candidate.version || "latest";
      const preResolvedFileName = `${ctx.safeFileName(appName)}-${ctx.safeFileName(preResolvedVersion)}.apk`;
      const preResolvedApkPath = path.join(downloadDir, preResolvedFileName);
      const providerDestinationPath = preResolvedApkPath;
      const needsRemoteResolve = apkSource.mode === "remote-fallback";
      if (options.dryRun && needsRemoteResolve) {
        ctx.logWarn(
          `DryRun: skip online provider resolve for [${appName}] (${versionLabel}). ` +
            "Run without --dry-run to resolve real provider URL.",
        );
        downloadInfo = {
          downloadUrl: "<provider-resolve-skipped>",
          resolvedVersion: candidate.version || "latest",
        };
      } else {
        downloadInfo = await resolveDownloadInfo(
          app,
          appName,
          apkSource,
          candidate.version,
          candidate.strictVersion,
          providerDestinationPath,
          options.force,
          ctx,
          providerState,
        );
        if (downloadInfo.downloadUrl) {
          ctx.logInfo(`Resolved download URL: ${downloadInfo.downloadUrl}`);
        } else if (downloadInfo.localPath) {
          ctx.logInfo(`Provider downloaded file: ${downloadInfo.localPath}`);
        }
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
      } else if (downloadInfo.localPath) {
        const sourcePath = path.resolve(downloadInfo.localPath);
        if (!(await ctx.fileExists(sourcePath))) {
          throw new Error(`[${appName}] provider output file not found: ${sourcePath}`);
        }
        if (path.normalize(sourcePath) !== path.normalize(apkPath)) {
          await ctx.ensureDir(path.dirname(apkPath));
          await fsp.copyFile(sourcePath, apkPath);
        }
      } else {
        await ctx.downloadFile(downloadInfo.downloadUrl, apkPath, "APK");
      }

      selectedApkPath = apkPath;
      selectedVersion = effectiveVersion;
      selectedProvider = downloadInfo && downloadInfo.provider ? downloadInfo.provider : null;
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
    provider: selectedProvider,
  };
}

module.exports = {
  resolveApkSource,
  resolveApk,
};
