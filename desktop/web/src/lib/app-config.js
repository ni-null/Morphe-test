import { hasText, resolveDisplayName, mergeRepoOptions, packageToSectionName } from "./app-utils"
import {
  RESERVED_SECTIONS,
  DEFAULT_ENGINE_SOURCE_REPO,
  DEFAULT_PATCH_BUNDLE_SOURCE_REPO,
} from "./app-constants"
import appPresets from "../data/app-presets.json"

let appIdSeed = 0

function createAppId() {
  appIdSeed += 1
  return `app-${Date.now()}-${appIdSeed}`
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function formatTomlValue(value) {
  if (Array.isArray(value)) {
    const entries = value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => `"${escapeTomlString(item)}"`)
    return `[${entries.join(", ")}]`
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return `"${escapeTomlString(String(value || ""))}"`
}

function stripInlineComment(value) {
  let quoted = false
  let escaped = false
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (escaped) { escaped = false; continue }
    if (char === "\\") { escaped = true; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (char === "#" && !quoted) return value.slice(0, i).trim()
  }
  return value.trim()
}

function parseTomlValue(rawValue) {
  const value = stripInlineComment(String(rawValue || "").trim())
  if (!value) return ""

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(",").map((item) => String(item || "").trim()).filter(Boolean).map((item) => {
      if (item.startsWith('"') && item.endsWith('"') && item.length >= 2) {
        return item.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      }
      return item
    })
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+(\.\d+)?$/u.test(value)) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return value
}

function parseSimpleToml(content) {
  const sections = {}
  let currentSection = null
  for (const lineRaw of String(content || "").split(/\r?\n/u)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith("#")) continue
    const sectionMatch = line.match(/^\[([^\]]+)\]$/u)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim()
      if (!sections[currentSection]) sections[currentSection] = {}
      continue
    }
    if (!currentSection) continue
    const pairMatch = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u)
    if (!pairMatch) continue
    sections[currentSection][pairMatch[1].trim()] = parseTomlValue(pairMatch[2].trim())
  }
  return sections
}

function readTomlString(section, keys) {
  if (!section) return ""
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(section, key) && hasText(section[key])) {
      return String(section[key]).trim()
    }
  }
  return ""
}

function readTomlStringArray(section, keys) {
  if (!section) return []
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(section, key)) continue
    const raw = section[key]
    if (Array.isArray(raw)) return raw.map((item) => String(item || "").trim()).filter(Boolean)
    if (hasText(raw)) return String(raw).split(",").map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function normalizeAppMode(rawMode) {
  if (rawMode === false) return "false"
  const value = String(rawMode || "").trim().toLowerCase()
  if (value === "remote" || value === "local" || value === "false") return value
  return "remote"
}

export function createEmptyApp(name = "", options = {}) {
  const sectionName = hasText(name) ? String(name).trim() : ""
  const packageName = hasText(options.packageName) ? String(options.packageName).trim() : ""
  return {
    id: createAppId(),
    name: sectionName,
    displayName: hasText(options.displayName) ? String(options.displayName).trim() : resolveDisplayName(packageName, sectionName),
    packageName,
    mode: "remote",
    ver: "",
    patchesMode: "default",
    patches: [],
    localApkSelectedPath: "",
    localApkCustomPath: "",
    apkmirrorDlurl: "",
    uptodownDlurl: "",
    archiveDlurl: "",
  }
}

function createLegacyDefaultApps() {
  const youtube = createEmptyApp("youtube", { packageName: "com.google.android.youtube", displayName: "YouTube" })
  const youtubeMusic = createEmptyApp("youtube_music", { packageName: "com.google.android.apps.youtube.music", displayName: "YouTube Music" })
  const reddit = createEmptyApp("reddit", { packageName: "com.reddit.frontpage", displayName: "Reddit" })
  youtube.mode = "remote"
  youtubeMusic.mode = "false"
  reddit.mode = "false"
  return [youtube, youtubeMusic, reddit]
}

function createDefaultPatchCliConfig() {
  return {
    mode: "stable",
    patchesRepo: DEFAULT_ENGINE_SOURCE_REPO,
    repoOptions: [DEFAULT_ENGINE_SOURCE_REPO],
    path: "",
  }
}

function createDefaultAppsFromPresets() {
  const templates = Array.isArray(appPresets) ? appPresets : []
  if (templates.length === 0) return createLegacyDefaultApps()

  const nextApps = []
  const seenSectionKeys = new Set()
  const seenPackageKeys = new Set()

  for (const template of templates) {
    const packageName = String(template?.packageName || template?.package_name || "").trim()
    const section = hasText(template?.name) ? String(template.name).trim() : packageToSectionName(packageName)
    if (!hasText(section)) continue
    const sectionKey = section.toLowerCase()
    const packageKey = packageName.toLowerCase()
    if (seenSectionKeys.has(sectionKey)) continue
    if (packageKey && seenPackageKeys.has(packageKey)) continue

    const label = hasText(template?.displayName) ? String(template.displayName).trim() : resolveDisplayName(packageName, section)
    const app = createEmptyApp(section, { packageName, displayName: label })
    app.mode = normalizeAppMode(template?.mode)
    app.patchesMode = String(template?.patches_mode || template?.patchesMode || "").trim().toLowerCase() === "custom" ? "custom" : "default"
    if (Array.isArray(template?.patches)) app.patches = template.patches.map((item) => String(item || "").trim()).filter(Boolean)
    if (hasText(template?.apkmirror_dlurl)) app.apkmirrorDlurl = String(template.apkmirror_dlurl).trim()
    if (hasText(template?.uptodown_dlurl)) app.uptodownDlurl = String(template.uptodown_dlurl).trim()
    if (hasText(template?.archive_dlurl)) app.archiveDlurl = String(template.archive_dlurl).trim()

    nextApps.push(app)
    seenSectionKeys.add(sectionKey)
    if (packageKey) seenPackageKeys.add(packageKey)
  }
  if (nextApps.length === 0) return createLegacyDefaultApps()
  return nextApps
}

export function createDefaultConfigForm() {
  const defaultPatchCli = createDefaultPatchCliConfig()
  return {
    patchCli: { ...defaultPatchCli },
    patches: { mode: "stable", patchesRepo: DEFAULT_PATCH_BUNDLE_SOURCE_REPO, repoOptions: [DEFAULT_PATCH_BUNDLE_SOURCE_REPO], path: "" },
    signing: { keystorePath: "" },
    apps: createDefaultAppsFromPresets(),
  }
}

export function resolvePatchCliConfig(configForm) {
  const source = configForm && typeof configForm === "object" ? configForm : {}
  const patchCli = source.patchCli && typeof source.patchCli === "object" ? source.patchCli : null
  if (patchCli) return patchCli
  return createDefaultPatchCliConfig()
}

export function getAppPresetTemplates() {
  return Array.isArray(appPresets) ? appPresets : []
}

function appFromToml(name, section) {
  const packageName = readTomlString(section, ["package_name", "package-name"])
  const app = createEmptyApp(name, { packageName, displayName: resolveDisplayName(packageName, name) })
  app.mode = normalizeAppMode(section && Object.prototype.hasOwnProperty.call(section, "mode") ? section.mode : "")
  app.ver = readTomlString(section, ["ver"])
  app.patchesMode = readTomlString(section, ["patches_mode", "patches-mode"]).toLowerCase() === "custom" ? "custom" : "default"
  const rawPatches = section && Object.prototype.hasOwnProperty.call(section, "patches") ? section.patches : []
  if (Array.isArray(rawPatches)) {
    app.patches = rawPatches.map((item) => String(item || "").trim()).filter(Boolean)
  } else {
    app.patches = String(rawPatches || "").split(",").map((item) => item.trim()).filter(Boolean)
  }
  app.localApkCustomPath = readTomlString(section, ["local_apk", "local-apk", "source_apk", "source-apk", "apk_path", "apk-path"])
  app.localApkSelectedPath = ""
  app.apkmirrorDlurl = readTomlString(section, ["apkmirror-dlurl", "apkmirror_dlurl"])
  app.uptodownDlurl = readTomlString(section, ["uptodown-dlurl", "uptodown_dlurl"])
  app.archiveDlurl = readTomlString(section, ["archive-dlurl", "archive_dlurl"])
  return app
}

export function configFormFromToml(content) {
  const parsed = parseSimpleToml(content)
  const defaults = createDefaultConfigForm()

  const engineSourceCfg = parsed.engine || {}
  const patchBundleCfg = parsed.patches || parsed["patch-bundle"] || parsed.patch_bundle || {}

  const engineSourceMode = readTomlString(engineSourceCfg, ["mode"]).toLowerCase()
  if (engineSourceMode === "stable" || engineSourceMode === "dev" || engineSourceMode === "local") {
    defaults.patchCli.mode = engineSourceMode
  }
  const engineSourceRepo = readTomlString(engineSourceCfg, ["source_repo", "source-repo", "repo", "patches_repo"])
  if (hasText(engineSourceRepo)) defaults.patchCli.patchesRepo = engineSourceRepo
  const engineSourceRepoOptions = readTomlStringArray(engineSourceCfg, [
    "source_repo_options",
    "source-repo-options",
    "source_repos",
    "source-repos",
    "repo_options",
    "repo-options",
    "repos",
  ])
  defaults.patchCli.repoOptions = mergeRepoOptions(
    engineSourceRepoOptions,
    defaults.patchCli.patchesRepo,
    DEFAULT_ENGINE_SOURCE_REPO,
  )
  defaults.patchCli.path = readTomlString(engineSourceCfg, ["path"])

  const patchBundleMode = readTomlString(patchBundleCfg, ["mode"]).toLowerCase()
  if (patchBundleMode === "stable" || patchBundleMode === "dev" || patchBundleMode === "local") {
    defaults.patches.mode = patchBundleMode
  }
  const patchBundleRepo = readTomlString(patchBundleCfg, ["source_repo", "source-repo", "repo", "patches_repo"])
  if (hasText(patchBundleRepo)) defaults.patches.patchesRepo = patchBundleRepo
  const patchBundleRepoOptions = readTomlStringArray(patchBundleCfg, [
    "source_repo_options",
    "source-repo-options",
    "source_repos",
    "source-repos",
    "repo_options",
    "repo-options",
    "repos",
  ])
  defaults.patches.repoOptions = mergeRepoOptions(
    patchBundleRepoOptions,
    defaults.patches.patchesRepo,
    DEFAULT_PATCH_BUNDLE_SOURCE_REPO,
  )
  defaults.patches.path = readTomlString(patchBundleCfg, ["path"])

  const signingCfg = parsed.signing || parsed.sign || {}
  defaults.signing.keystorePath = readTomlString(signingCfg, ["keystore_path", "keystore-path", "path"])

  const appNames = Object.keys(parsed).filter((name) => !RESERVED_SECTIONS.has(name.toLowerCase()))
  if (appNames.length > 0) defaults.apps = appNames.map((name) => appFromToml(name, parsed[name] || {}))

  return defaults
}

function pushTomlEntry(entries, key, enabled, value) {
  if (!enabled || !hasText(value)) return
  entries.push([key, String(value).trim()])
}

function buildTomlSectionLines(title, entries) {
  if (!entries.length) return []
  const lines = [`[${title}]`]
  for (const [key, value] of entries) lines.push(`${key} = ${formatTomlValue(value)}`)
  return lines
}

export function configFormToToml(configForm) {
  const blocks = []
  const patchCliCfg = resolvePatchCliConfig(configForm)
  const patchBundleCfg = configForm?.patches || {}

  const engineSourceEntries = []
  pushTomlEntry(engineSourceEntries, "mode", true, patchCliCfg.mode || "stable")
  if ((patchCliCfg.mode || "stable") === "local") {
    pushTomlEntry(engineSourceEntries, "path", true, patchCliCfg.path)
  } else {
    pushTomlEntry(engineSourceEntries, "patches_repo", true, patchCliCfg.patchesRepo)
    pushTomlEntry(engineSourceEntries, "source_repo", true, patchCliCfg.patchesRepo)
  }
  const engineSourceRepoOptions = mergeRepoOptions(patchCliCfg.repoOptions, patchCliCfg.patchesRepo, DEFAULT_ENGINE_SOURCE_REPO)
  if (engineSourceRepoOptions.length > 0) {
    engineSourceEntries.push(["repo_options", engineSourceRepoOptions])
    engineSourceEntries.push(["source_repo_options", engineSourceRepoOptions])
  }
  const engineSourceLines = buildTomlSectionLines("engine", engineSourceEntries)
  if (engineSourceLines.length) blocks.push(engineSourceLines)

  const patchesEntries = []
  pushTomlEntry(patchesEntries, "mode", true, patchBundleCfg.mode || "stable")
  if ((patchBundleCfg.mode || "stable") === "local") {
    pushTomlEntry(patchesEntries, "path", true, patchBundleCfg.path)
  } else {
    pushTomlEntry(patchesEntries, "patches_repo", true, patchBundleCfg.patchesRepo)
    pushTomlEntry(patchesEntries, "source_repo", true, patchBundleCfg.patchesRepo)
  }
  const patchesRepoOptions = mergeRepoOptions(patchBundleCfg?.repoOptions, patchBundleCfg?.patchesRepo, DEFAULT_PATCH_BUNDLE_SOURCE_REPO)
  if (patchesRepoOptions.length > 0) {
    patchesEntries.push(["repo_options", patchesRepoOptions])
    patchesEntries.push(["source_repo_options", patchesRepoOptions])
  }
  const patchesLines = buildTomlSectionLines("patches", patchesEntries)
  if (patchesLines.length) blocks.push(patchesLines)

  const signingEntries = []
  const signingKeystorePath = hasText(configForm?.signing?.keystorePath) ? configForm.signing.keystorePath : ""
  pushTomlEntry(signingEntries, "keystore_path", hasText(signingKeystorePath), signingKeystorePath)
  const signingLines = buildTomlSectionLines("signing", signingEntries)
  if (signingLines.length) blocks.push(signingLines)

  for (const app of configForm.apps) {
    const appName = String(app.name || "").trim()
    if (!appName) continue
    const appEntries = []
    const disabledByMode = app.mode === "false"
    const effectiveLocalApkPath = hasText(app.localApkCustomPath) ? app.localApkCustomPath : ""
    const resolvedMode = disabledByMode ? "false" : hasText(effectiveLocalApkPath) ? "local" : "remote"
    appEntries.push(["mode", resolvedMode === "false" ? false : resolvedMode])
    pushTomlEntry(appEntries, "package_name", true, app.packageName)
    pushTomlEntry(appEntries, "ver", hasText(app.ver), app.ver)
    if (app.patchesMode === "custom") {
      pushTomlEntry(appEntries, "patches_mode", true, "custom")
      if (Array.isArray(app.patches) && app.patches.length > 0) appEntries.push(["patches", app.patches])
    }
    if (resolvedMode === "local") pushTomlEntry(appEntries, "local_apk", hasText(effectiveLocalApkPath), effectiveLocalApkPath)
    pushTomlEntry(appEntries, "apkmirror-dlurl", hasText(app.apkmirrorDlurl), app.apkmirrorDlurl)
    pushTomlEntry(appEntries, "uptodown-dlurl", hasText(app.uptodownDlurl), app.uptodownDlurl)
    pushTomlEntry(appEntries, "archive-dlurl", hasText(app.archiveDlurl), app.archiveDlurl)
    const appLines = buildTomlSectionLines(appName, appEntries)
    if (appLines.length) blocks.push(appLines)
  }

  return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n`
}
