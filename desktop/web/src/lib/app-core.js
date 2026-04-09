import { getPatchTranslationsForLocale } from "../i18n"
import defaultPackageMetaMap from "../../json/package-name-meta.json"
import appPresets from "../../json/app-presets.json"

export const DEFAULT_PACKAGE_META_MAP = defaultPackageMetaMap && typeof defaultPackageMetaMap === "object" ? defaultPackageMetaMap : {}

export const RESERVED_SECTIONS = new Set(["global", "morphe-cli", "morphe_cli", "patches", "signing", "sign"])

export const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
export const MORPHE_SOURCE_REPOS_KEY = "morphe.source.repos"
export const PATCHES_SOURCE_REPOS_KEY = "patches.source.repos"
export const KEYSTORE_SELECTED_PATH_KEY = "morphe.signing.keystore.path"
export const DEFAULT_MORPHE_SOURCE_REPO = "MorpheApp/morphe-cli"
export const DEFAULT_PATCHES_SOURCE_REPO = "MorpheApp/morphe-patches"
export const APP_VER_AUTO_VALUE = "__APP_AUTO__"
export const MORPHE_REMOTE_STABLE_VALUE = "__MORPHE_REMOTE_STABLE__"
export const MORPHE_REMOTE_DEV_VALUE = "__MORPHE_REMOTE_DEV__"
export const PATCHES_REMOTE_STABLE_VALUE = "__PATCHES_REMOTE_STABLE__"
export const PATCHES_REMOTE_DEV_VALUE = "__PATCHES_REMOTE_DEV__"
const PACKAGE_NAME_LABELS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [
    String(packageName || "")
      .trim()
      .toLowerCase(),
    String(meta?.label || "").trim(),
  ]),
)
const PACKAGE_NAME_ICON_FALLBACKS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [
    String(packageName || "")
      .trim()
      .toLowerCase(),
    String(meta?.icon || "").trim(),
  ]),
)

let appIdSeed = 0

function createAppId() {
  appIdSeed += 1
  return `app-${Date.now()}-${appIdSeed}`
}

export function hasText(value) {
  return String(value || "").trim().length > 0
}

export function normalizePackageIconPath(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  if (/^(https?:|data:|file:)/i.test(text)) return text
  if (text.startsWith("/assets/")) return `.${text}`
  if (text.startsWith("assets/")) return `./${text}`
  return text
}

export function getPackageIconFallback(packageName) {
  const key = String(packageName || "")
    .trim()
    .toLowerCase()
  if (!key) return ""
  return hasText(PACKAGE_NAME_ICON_FALLBACKS[key]) ? normalizePackageIconPath(PACKAGE_NAME_ICON_FALLBACKS[key]) : ""
}

export function extractSourceFolderLabel(file) {
  const relativePath = String(file?.relativePath || "")
    .trim()
    .replace(/\\/g, "/")
  if (relativePath) {
    const repoDir = String(relativePath.split("/")[0] || "").trim()
    if (repoDir) return repoDir.replace(/@/g, "/")
  }
  return ""
}

export function mergeRepoOptions(prev, candidate, baseRepo = "") {
  const list = Array.isArray(prev) ? prev : []
  const merged = list.map((item) => String(item || "").trim()).filter(Boolean)
  const repo = String(candidate || "").trim()
  if (repo && !merged.some((item) => item.toLowerCase() === repo.toLowerCase())) {
    merged.push(repo)
  }
  const base = String(baseRepo || "").trim()
  if (base && !merged.some((item) => item.toLowerCase() === base.toLowerCase())) {
    merged.unshift(base)
  }
  return Array.from(new Set(merged))
}

function extractVersionPartsFromName(name) {
  const text = String(name || "").toLowerCase()
  const match = text.match(/(\d+(?:\.\d+){1,4})(?:[-._]?(dev|alpha|beta|rc)[-._]?(\d+)?)?/u)
  if (!match) return null
  const numbers = String(match[1] || "")
    .split(".")
    .map((item) => Number(item))
    .map((item) => (Number.isFinite(item) ? item : 0))
  while (numbers.length < 5) numbers.push(0)
  const tag = String(match[2] || "")
    .trim()
    .toLowerCase()
  const tagNum = Number(match[3] || 0)
  const tagRankMap = { dev: 1, alpha: 2, beta: 3, rc: 4 }
  const tagRank = tag ? tagRankMap[tag] || 0 : 5
  return {
    numbers,
    tagRank,
    tagNum: Number.isFinite(tagNum) ? tagNum : 0,
  }
}

function compareVersionPartsDesc(left, right) {
  for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i += 1) {
    const l = left.numbers[i] || 0
    const r = right.numbers[i] || 0
    if (l !== r) return r - l
  }
  if (left.tagRank !== right.tagRank) return right.tagRank - left.tagRank
  if (left.tagNum !== right.tagNum) return right.tagNum - left.tagNum
  return 0
}

export function pickSourceFileName(fullPath) {
  const value = String(fullPath || "").trim()
  if (!value) return ""
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts.length > 0 ? parts[parts.length - 1] : value
}

export function sortFilesByVersion(items) {
  const list = Array.isArray(items) ? items : []
  return [...list].sort((a, b) => {
    const nameA = String(a?.name || a?.fileName || pickSourceFileName(a?.fullPath) || "").trim()
    const nameB = String(b?.name || b?.fileName || pickSourceFileName(b?.fullPath) || "").trim()
    const versionA = extractVersionPartsFromName(nameA)
    const versionB = extractVersionPartsFromName(nameB)

    if (versionA && versionB) {
      const diff = compareVersionPartsDesc(versionA, versionB)
      if (diff !== 0) return diff
    } else if (versionA && !versionB) {
      return -1
    } else if (!versionA && versionB) {
      return 1
    }

    const nameDiff = nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: "base" })
    if (nameDiff !== 0) return nameDiff
    const pathA = String(a?.relativePath || a?.fullPath || "").trim()
    const pathB = String(b?.relativePath || b?.fullPath || "").trim()
    return pathB.localeCompare(pathA, undefined, { numeric: true, sensitivity: "base" })
  })
}

export function dedupeSourceVersions(items) {
  const list = Array.isArray(items) ? items : []
  const seen = new Set()
  const output = []
  for (const item of list) {
    const fileName = String(item?.fileName || "").trim()
    if (!fileName) continue
    const key = fileName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push({
      ...item,
      fileName,
    })
  }
  return output
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
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === "#" && !quoted) {
      return value.slice(0, i).trim()
    }
  }
  return value.trim()
}

function parseTomlValue(rawValue) {
  const value = stripInlineComment(String(rawValue || "").trim())
  if (!value) return ""

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(",")
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => {
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
  const lines = String(content || "").split(/\r?\n/u)

  for (const lineRaw of lines) {
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

    const key = pairMatch[1].trim()
    const rawValue = pairMatch[2].trim()
    sections[currentSection][key] = parseTomlValue(rawValue)
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
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item || "").trim()).filter(Boolean)
    }
    if (hasText(raw)) {
      return String(raw)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function normalizeAppMode(rawMode) {
  if (rawMode === false) return "false"
  const value = String(rawMode || "")
    .trim()
    .toLowerCase()
  if (value === "remote" || value === "local" || value === "false") {
    return value
  }
  return "remote"
}

export function packageToSectionName(packageName) {
  const key = String(packageName || "")
    .trim()
    .toLowerCase()
  if (hasText(PACKAGE_NAME_LABELS[key])) {
    const mapped = String(PACKAGE_NAME_LABELS[key]).trim()
    const mappedNormalized = mapped
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
    if (mappedNormalized) {
      if (/^[0-9]/u.test(mappedNormalized)) return `app_${mappedNormalized}`
      return mappedNormalized
    }
  }
  const normalized = String(packageName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (!normalized) return "app_template"
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`
  return normalized
}

export function customAppNameToSectionName(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (!normalized) return "custom_app"
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`
  return normalized
}

export function resolveDisplayName(packageName, fallbackName) {
  const key = String(packageName || "")
    .trim()
    .toLowerCase()
  if (hasText(PACKAGE_NAME_LABELS[key])) return PACKAGE_NAME_LABELS[key]
  if (hasText(packageName)) return `[${String(packageName).trim()}]`
  if (hasText(fallbackName)) return String(fallbackName).trim()
  return "app"
}

export function normalizeTemplatePackageName(template) {
  const directCandidates = [template?.packageName, template?.package_name, template?.package]
  for (const candidate of directCandidates) {
    if (hasText(candidate)) {
      return String(candidate).trim()
    }
  }

  const section = hasText(template?.section) ? String(template.section).trim() : hasText(template?.key) ? String(template.key).trim() : ""
  if (!section) return ""

  if (!section.includes(".") && /_/u.test(section)) {
    const restored = section.replace(/_/gu, ".")
    if (/^[a-z0-9]+(\.[a-z0-9_]+)+$/iu.test(restored)) {
      return restored
    }
  }
  return ""
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
  const youtube = createEmptyApp("youtube", {
    packageName: "com.google.android.youtube",
    displayName: "YouTube",
  })
  const youtubeMusic = createEmptyApp("youtube_music", {
    packageName: "com.google.android.apps.youtube.music",
    displayName: "YouTube Music",
  })
  const reddit = createEmptyApp("reddit", {
    packageName: "com.reddit.frontpage",
    displayName: "Reddit",
  })
  youtube.mode = "remote"
  youtubeMusic.mode = "false"
  reddit.mode = "false"
  return [youtube, youtubeMusic, reddit]
}

function createDefaultAppsFromPresets() {
  const templates = Array.isArray(appPresets) ? appPresets : []
  if (templates.length === 0) {
    return createLegacyDefaultApps()
  }

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
    app.patchesMode = String(template?.patches_mode || template?.patchesMode || "")
      .trim()
      .toLowerCase() === "custom"
      ? "custom"
      : "default"
    if (Array.isArray(template?.patches)) {
      app.patches = template.patches.map((item) => String(item || "").trim()).filter(Boolean)
    }
    if (hasText(template?.apkmirror_dlurl)) app.apkmirrorDlurl = String(template.apkmirror_dlurl).trim()
    if (hasText(template?.uptodown_dlurl)) app.uptodownDlurl = String(template.uptodown_dlurl).trim()
    if (hasText(template?.archive_dlurl)) app.archiveDlurl = String(template.archive_dlurl).trim()

    nextApps.push(app)
    seenSectionKeys.add(sectionKey)
    if (packageKey) seenPackageKeys.add(packageKey)
  }

  if (nextApps.length === 0) {
    return createLegacyDefaultApps()
  }
  return nextApps
}

export function getAppPresetTemplates() {
  return Array.isArray(appPresets) ? appPresets : []
}

export function createDefaultConfigForm() {
  return {
    morpheCli: {
      mode: "stable",
      patchesRepo: DEFAULT_MORPHE_SOURCE_REPO,
      repoOptions: [DEFAULT_MORPHE_SOURCE_REPO],
      path: "",
    },
    patches: {
      mode: "stable",
      patchesRepo: DEFAULT_PATCHES_SOURCE_REPO,
      repoOptions: [DEFAULT_PATCHES_SOURCE_REPO],
      path: "",
    },
    signing: {
      keystorePath: "",
    },
    apps: createDefaultAppsFromPresets(),
  }
}

function appFromToml(name, section) {
  const packageName = readTomlString(section, ["package_name", "package-name"])
  const app = createEmptyApp(name, {
    packageName,
    displayName: resolveDisplayName(packageName, name),
  })
  app.mode = normalizeAppMode(section && Object.prototype.hasOwnProperty.call(section, "mode") ? section.mode : "")

  app.ver = readTomlString(section, ["ver"])
  app.patchesMode = readTomlString(section, ["patches_mode", "patches-mode"]).toLowerCase() === "custom" ? "custom" : "default"
  const rawPatches = section && Object.prototype.hasOwnProperty.call(section, "patches") ? section.patches : []
  if (Array.isArray(rawPatches)) {
    app.patches = rawPatches.map((item) => String(item || "").trim()).filter(Boolean)
  } else {
    app.patches = String(rawPatches || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
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

  const morpheCliCfg = parsed["morphe-cli"] || parsed.morphe_cli || {}
  const patchesCfg = parsed.patches || {}

  const morpheMode = readTomlString(morpheCliCfg, ["mode"]).toLowerCase()
  if (morpheMode === "stable" || morpheMode === "dev" || morpheMode === "local") {
    defaults.morpheCli.mode = morpheMode
  }
  const morpheRepo = readTomlString(morpheCliCfg, ["patches_repo"])
  if (hasText(morpheRepo)) {
    defaults.morpheCli.patchesRepo = morpheRepo
  }
  const morpheRepoOptions = readTomlStringArray(morpheCliCfg, ["repo_options", "repo-options", "repos"])
  defaults.morpheCli.repoOptions = mergeRepoOptions(morpheRepoOptions, defaults.morpheCli.patchesRepo, DEFAULT_MORPHE_SOURCE_REPO)
  defaults.morpheCli.path = readTomlString(morpheCliCfg, ["path"])

  const patchesMode = readTomlString(patchesCfg, ["mode"]).toLowerCase()
  if (patchesMode === "stable" || patchesMode === "dev" || patchesMode === "local") {
    defaults.patches.mode = patchesMode
  }
  const patchesRepo = readTomlString(patchesCfg, ["patches_repo"])
  if (hasText(patchesRepo)) {
    defaults.patches.patchesRepo = patchesRepo
  }
  const patchesRepoOptions = readTomlStringArray(patchesCfg, ["repo_options", "repo-options", "repos"])
  defaults.patches.repoOptions = mergeRepoOptions(patchesRepoOptions, defaults.patches.patchesRepo, DEFAULT_PATCHES_SOURCE_REPO)
  defaults.patches.path = readTomlString(patchesCfg, ["path"])

  const signingCfg = parsed.signing || parsed.sign || {}
  defaults.signing.keystorePath = readTomlString(signingCfg, ["keystore_path", "keystore-path", "path"])

  const appNames = Object.keys(parsed).filter((name) => !RESERVED_SECTIONS.has(name.toLowerCase()))
  if (appNames.length > 0) {
    defaults.apps = appNames.map((name) => appFromToml(name, parsed[name] || {}))
  }

  return defaults
}

function pushTomlEntry(entries, key, enabled, value) {
  if (!enabled || !hasText(value)) return
  entries.push([key, String(value).trim()])
}

function buildTomlSectionLines(title, entries) {
  if (!entries.length) return []
  const lines = [`[${title}]`]
  for (const [key, value] of entries) {
    lines.push(`${key} = ${formatTomlValue(value)}`)
  }
  return lines
}

export function configFormToToml(configForm) {
  const blocks = []

  const morpheEntries = []
  pushTomlEntry(morpheEntries, "mode", true, configForm.morpheCli.mode || "stable")
  if ((configForm.morpheCli.mode || "stable") === "local") {
    pushTomlEntry(morpheEntries, "path", true, configForm.morpheCli.path)
  } else {
    pushTomlEntry(morpheEntries, "patches_repo", true, configForm.morpheCli.patchesRepo)
  }
  const morpheRepoOptions = mergeRepoOptions(configForm?.morpheCli?.repoOptions, configForm?.morpheCli?.patchesRepo, DEFAULT_MORPHE_SOURCE_REPO)
  if (morpheRepoOptions.length > 0) {
    morpheEntries.push(["repo_options", morpheRepoOptions])
  }
  const morpheLines = buildTomlSectionLines("morphe-cli", morpheEntries)
  if (morpheLines.length) blocks.push(morpheLines)

  const patchesEntries = []
  pushTomlEntry(patchesEntries, "mode", true, configForm.patches.mode || "stable")
  if ((configForm.patches.mode || "stable") === "local") {
    pushTomlEntry(patchesEntries, "path", true, configForm.patches.path)
  } else {
    pushTomlEntry(patchesEntries, "patches_repo", true, configForm.patches.patchesRepo)
  }
  const patchesRepoOptions = mergeRepoOptions(configForm?.patches?.repoOptions, configForm?.patches?.patchesRepo, DEFAULT_PATCHES_SOURCE_REPO)
  if (patchesRepoOptions.length > 0) {
    patchesEntries.push(["repo_options", patchesRepoOptions])
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
      if (Array.isArray(app.patches) && app.patches.length > 0) {
        appEntries.push(["patches", app.patches])
      }
    }
    if (resolvedMode === "local") {
      pushTomlEntry(appEntries, "local_apk", hasText(effectiveLocalApkPath), effectiveLocalApkPath)
    }
    pushTomlEntry(appEntries, "apkmirror-dlurl", hasText(app.apkmirrorDlurl), app.apkmirrorDlurl)
    pushTomlEntry(appEntries, "uptodown-dlurl", hasText(app.uptodownDlurl), app.uptodownDlurl)
    pushTomlEntry(appEntries, "archive-dlurl", hasText(app.archiveDlurl), app.archiveDlurl)

    const appLines = buildTomlSectionLines(appName, appEntries)
    if (appLines.length) blocks.push(appLines)
  }

  return `${blocks.map((block) => block.join("\n")).join("\n\n")}\n`
}

export function buildTaskPayload(configPath, flags, signingKeystorePath = "") {
  const safeFlags = flags || {}
  return {
    configPath,
    signingKeystorePath: hasText(signingKeystorePath) ? String(signingKeystorePath).trim() : "",
    dryRun: !!safeFlags.dryRun,
    force: !!safeFlags.force,
    downloadOnly: false,
    patchesOnly: false,
    morpheCliOnly: false,
    persistLogs: true,
  }
}

export function isBuildTask(task) {
  if (!task || !task.modes) return true
  const modes = task.modes || {}
  return !modes.downloadOnly && !modes.patchesOnly && !modes.morpheCliOnly
}

export function getPatchTranslation(locale, name, description) {
  const rawName = String(name || "").trim()
  const rawDescription = String(description || "").trim()
  if (!hasText(rawName)) return { name: rawName, description: rawDescription }

  const entries = getPatchTranslationsForLocale(locale)
  const normalize = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
  const normalizedName = normalize(rawName)
  const normalizedDescription = normalize(rawDescription)
  const exactKey = JSON.stringify([rawName, rawDescription])
  const normalizedKey = JSON.stringify([normalizedName, normalizedDescription])
  const byNameOnlyKey = JSON.stringify([rawName, ""])

  const table = entries && typeof entries === "object" ? entries : {}
  const byKey = table[exactKey] || table[normalizedKey] || table[byNameOnlyKey] || null
  const localized = byKey && typeof byKey === "object" ? byKey[locale] : null

  let translatedDescription = rawDescription
  if (localized && typeof localized.description === "string" && hasText(localized.description)) {
    translatedDescription = String(localized.description).trim()
  } else if (hasText(rawDescription)) {
    for (const [key, value] of Object.entries(table)) {
      if (!value || typeof value !== "object") continue
      const localizedCandidate = value[locale]
      if (!localizedCandidate || typeof localizedCandidate !== "object") continue
      const translatedCandidate = String(localizedCandidate.description || "").trim()
      if (!hasText(translatedCandidate)) continue
      try {
        const parsed = JSON.parse(key)
        const sourceDesc = Array.isArray(parsed) ? normalize(parsed[1]) : ""
        if (sourceDesc && sourceDesc === normalizedDescription) {
          translatedDescription = translatedCandidate
          break
        }
      } catch {
      }
    }
  }

  return {
    name: localized && hasText(localized.name) ? String(localized.name).trim() : rawName,
    description: translatedDescription,
  }
}
