import { useEffect, useMemo, useRef, useState } from "react"
import { Archive, Database, Globe, Hammer } from "lucide-react"
import { fetchConfig, fetchPackageMap, saveConfig, fetchAppTemplates } from "./services/configService"
import { fetchAppCompatibleVersions, fetchAppPatchOptions } from "./services/appService"
import { deleteSourceFile, fetchAndSaveSource, fetchSourceVersions, listDownloadedApks, browseLocalApkPath, listSourceFiles } from "./services/sourceService"
import { clearAllCache, deleteAllTasks, deleteTask, fetchTask, fetchTaskLog, fetchTaskArtifacts, listTasks, openTaskArtifactDir, openTaskOutputDir, startTask, stopTask } from "./services/taskService"
import { Button } from "./components/ui/button"
import { Label } from "./components/ui/label"
import { Separator } from "./components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { cn } from "./lib/utils"
import { SUPPORTED_LOCALES, getPatchTranslationsForLocale, t as translate } from "./i18n"
import { useUiStore } from "./stores/uiStore"
import { useDialogStore } from "./stores/dialogStore"
import BuildPage from "./pages/BuildPage"
import HistoryPage from "./pages/HistoryPage"
import AssetsPage from "./pages/AssetsPage"
import defaultPackageMetaMap from "../json/package-name-meta.json"
import AppSettingsDialog from "./features/app/AppSettingsDialog"
import ConfigPathDialog from "./features/dialogs/ConfigPathDialog"
import ConfirmActionDialog from "./features/dialogs/ConfirmActionDialog"
import MorpheSettingsDialog from "./features/source/MorpheSettingsDialog"
import PatchesSettingsDialog from "./features/source/PatchesSettingsDialog"
import TaskDialogs from "./features/task/TaskDialogs"

const NAV_BUILD = "build"
const NAV_HISTORY = "history"
const NAV_ASSETS = "assets"

const TASK_MODE_BUILD = "build"
const RESERVED_SECTIONS = new Set(["global", "morphe-cli", "morphe_cli", "patches"])

const DEFAULT_FLAGS = {
  dryRun: true,
  force: false,
}

const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
const MORPHE_SOURCE_REPOS_KEY = "morphe.source.repos"
const PATCHES_SOURCE_REPOS_KEY = "patches.source.repos"
const DEFAULT_MORPHE_SOURCE_REPO = "MorpheApp/morphe-cli"
const DEFAULT_PATCHES_SOURCE_REPO = "MorpheApp/morphe-patches"
const APP_VER_AUTO_VALUE = "__APP_AUTO__"
const MORPHE_REMOTE_STABLE_VALUE = "__MORPHE_REMOTE_STABLE__"
const MORPHE_REMOTE_DEV_VALUE = "__MORPHE_REMOTE_DEV__"
const PATCHES_REMOTE_STABLE_VALUE = "__PATCHES_REMOTE_STABLE__"
const PATCHES_REMOTE_DEV_VALUE = "__PATCHES_REMOTE_DEV__"
const PACKAGE_NAME_LABELS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [String(packageName || "").trim().toLowerCase(), String(meta?.label || "").trim()]),
)
const PACKAGE_NAME_ICON_FALLBACKS = Object.fromEntries(
  Object.entries(defaultPackageMetaMap || {}).map(([packageName, meta]) => [String(packageName || "").trim().toLowerCase(), String(meta?.icon || "").trim()]),
)

let appIdSeed = 0

function createAppId() {
  appIdSeed += 1
  return `app-${Date.now()}-${appIdSeed}`
}

function hasText(value) {
  return String(value || "").trim().length > 0
}

function mergeRepoOptions(prev, candidate, baseRepo = "") {
  const list = Array.isArray(prev) ? prev : []
  const merged = list
    .map((item) => String(item || "").trim())
    .filter(Boolean)
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
  const tag = String(match[2] || "").trim().toLowerCase()
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

function sortFilesByVersion(items) {
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

function dedupeSourceVersions(items) {
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

function packageToSectionName(packageName) {
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

function resolveDisplayName(packageName, fallbackName) {
  const key = String(packageName || "")
    .trim()
    .toLowerCase()
  if (hasText(PACKAGE_NAME_LABELS[key])) return PACKAGE_NAME_LABELS[key]
  if (hasText(packageName)) return `[${String(packageName).trim()}]`
  if (hasText(fallbackName)) return String(fallbackName).trim()
  return "app"
}

function normalizeTemplatePackageName(template) {
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

function createEmptyApp(name = "", options = {}) {
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

function createDefaultConfigForm() {
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
    apps: [youtube, youtubeMusic, reddit],
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

  app.localApkCustomPath = readTomlString(section, [
    "local_apk",
    "local-apk",
    "source_apk",
    "source-apk",
    "apk_path",
    "apk-path",
  ])
  app.localApkSelectedPath = ""

  app.apkmirrorDlurl = readTomlString(section, ["apkmirror-dlurl", "apkmirror_dlurl"])

  app.uptodownDlurl = readTomlString(section, ["uptodown-dlurl", "uptodown_dlurl"])

  app.archiveDlurl = readTomlString(section, ["archive-dlurl", "archive_dlurl"])

  return app
}

function configFormFromToml(content) {
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

function configFormToToml(configForm) {
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

  for (const app of configForm.apps) {
    const appName = String(app.name || "").trim()
    if (!appName) continue

    const appEntries = []
    appEntries.push(["mode", app.mode === "false" ? false : app.mode === "local" ? "local" : "remote"])
    pushTomlEntry(appEntries, "package_name", true, app.packageName)
    pushTomlEntry(appEntries, "ver", hasText(app.ver), app.ver)
    if (app.patchesMode === "custom") {
      pushTomlEntry(appEntries, "patches_mode", true, "custom")
      if (Array.isArray(app.patches) && app.patches.length > 0) {
        appEntries.push(["patches", app.patches])
      }
    }
    if (app.mode === "local") {
      const effectiveLocalApkPath = hasText(app.localApkCustomPath) ? app.localApkCustomPath : app.localApkSelectedPath
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

function buildTaskPayload(configPath, mode, flags) {
  const safeFlags = flags || {}
  return {
    configPath,
    dryRun: !!safeFlags.dryRun,
    force: !!safeFlags.force,
    downloadOnly: false,
    patchesOnly: false,
    morpheCliOnly: false,
    persistLogs: mode === TASK_MODE_BUILD,
  }
}

function isBuildTask(task) {
  if (!task || !task.modes) return true
  const modes = task.modes || {}
  return !modes.downloadOnly && !modes.patchesOnly && !modes.morpheCliOnly
}

function statusVariant(status) {
  const value = String(status || "").toLowerCase()
  if (value === "completed") return "success"
  if (value === "canceled") return "failed"
  if (value === "failed") return "failed"
  if (value === "stopping") return "running"
  if (value === "running") return "running"
  return "outline"
}

function formatTaskLabel(task) {
  const startedAt = task.startedAt ? new Date(task.startedAt).toLocaleString() : "-"
  const folder = task.taskFolderName || task.id
  return `${folder} · ${startedAt}`
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let next = value
  let index = 0
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024
    index += 1
  }
  return `${next.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function getPatchTranslation(locale, name, description) {
  const rawName = String(name || "").trim()
  const rawDescription = String(description || "").trim()
  if (!hasText(rawName)) return { name: rawName, description: rawDescription }

  const entries = getPatchTranslationsForLocale(locale)
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim()
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
    // Fallback: description-only lookup across all translation entries.
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
        // ignore malformed keys
      }
    }
  }

  return {
    name: localized && hasText(localized.name) ? String(localized.name).trim() : rawName,
    description: translatedDescription,
  }
}

function pickSourceFileName(fullPath) {
  const value = String(fullPath || "").trim()
  if (!value) return ""
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts.length > 0 ? parts[parts.length - 1] : value
}

function isNotFoundError(error) {
  const text = String(error?.message || error || "").toLowerCase()
  return text.includes("404") || text.includes("not found")
}

function App() {
  const activeNav = useUiStore((state) => state.activeNav)
  const setActiveNav = useUiStore((state) => state.setActiveNav)
  const locale = useUiStore((state) => state.locale)
  const setLocale = useUiStore((state) => state.setLocale)
  const logDialogOpen = useDialogStore((state) => state.logDialogOpen)
  const setLogDialogOpen = useDialogStore((state) => state.setLogDialogOpen)
  const historyLogDialogOpen = useDialogStore((state) => state.historyLogDialogOpen)
  const setHistoryLogDialogOpen = useDialogStore((state) => state.setHistoryLogDialogOpen)
  const taskDetailDialogOpen = useDialogStore((state) => state.taskDetailDialogOpen)
  const setTaskDetailDialogOpen = useDialogStore((state) => state.setTaskDetailDialogOpen)
  const configPathDialogOpen = useDialogStore((state) => state.configPathDialogOpen)
  const setConfigPathDialogOpen = useDialogStore((state) => state.setConfigPathDialogOpen)
  const appSettingsOpen = useDialogStore((state) => state.appSettingsOpen)
  const setAppSettingsOpen = useDialogStore((state) => state.setAppSettingsOpen)
  const appSettingsId = useDialogStore((state) => state.appSettingsId)
  const setAppSettingsId = useDialogStore((state) => state.setAppSettingsId)
  const morpheSettingsOpen = useDialogStore((state) => state.morpheSettingsOpen)
  const setMorpheSettingsOpen = useDialogStore((state) => state.setMorpheSettingsOpen)
  const patchesSettingsOpen = useDialogStore((state) => state.patchesSettingsOpen)
  const setPatchesSettingsOpen = useDialogStore((state) => state.setPatchesSettingsOpen)
  const appDlurlPopoverOpen = useDialogStore((state) => state.appDlurlPopoverOpen)
  const setAppDlurlPopoverOpen = useDialogStore((state) => state.setAppDlurlPopoverOpen)
  const confirmDialog = useDialogStore((state) => state.confirmDialog)
  const setConfirmDialog = useDialogStore((state) => state.setConfirmDialog)
  const confirmDialogBusy = useDialogStore((state) => state.confirmDialogBusy)
  const setConfirmDialogBusy = useDialogStore((state) => state.setConfirmDialogBusy)

  const [configPath, setConfigPath] = useState("config.toml")
  const [configForm, setConfigForm] = useState(createDefaultConfigForm)
  const [rawConfigInput, setRawConfigInput] = useState("")
  const [rawOverrideMode, setRawOverrideMode] = useState(false)

  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLog, setTaskLog] = useState("")
  const [taskArtifacts, setTaskArtifacts] = useState([])
  const [taskOutputDir, setTaskOutputDir] = useState("")
  const [deletingAllTasks, setDeletingAllTasks] = useState(false)
  const [clearingAllCache, setClearingAllCache] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState("")
  const [openingTaskFolder, setOpeningTaskFolder] = useState(false)
  const [openingArtifactPath, setOpeningArtifactPath] = useState("")
  const [liveTaskId, setLiveTaskId] = useState("")
  const [liveTask, setLiveTask] = useState(null)
  const [liveTaskLog, setLiveTaskLog] = useState("")
  const [buildLaunchPending, setBuildLaunchPending] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [isAutoSavingConfig, setIsAutoSavingConfig] = useState(false)
  const [morpheLocalFiles, setMorpheLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [morpheDeleteName, setMorpheDeleteName] = useState("")
  const [patchesDeleteName, setPatchesDeleteName] = useState("")
  const [morpheSourceRepoOptions, setMorpheSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(MORPHE_SOURCE_REPOS_KEY) || "")
      if (!raw) return [DEFAULT_MORPHE_SOURCE_REPO]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, DEFAULT_MORPHE_SOURCE_REPO, DEFAULT_MORPHE_SOURCE_REPO)
    } catch {
      return [DEFAULT_MORPHE_SOURCE_REPO]
    }
  })
  const [morpheSourceRepo, setMorpheSourceRepo] = useState(DEFAULT_MORPHE_SOURCE_REPO)
  const [morpheSourceRepoDraft, setMorpheSourceRepoDraft] = useState("")
  const [morpheSourceVersions, setMorpheSourceVersions] = useState([])
  const [morpheSourceVersion, setMorpheSourceVersion] = useState("")
  const [morpheSourceLoading, setMorpheSourceLoading] = useState(false)
  const [morpheSourceDownloading, setMorpheSourceDownloading] = useState(false)
  const [patchesSourceRepoOptions, setPatchesSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(PATCHES_SOURCE_REPOS_KEY) || "")
      if (!raw) return [DEFAULT_PATCHES_SOURCE_REPO]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, DEFAULT_PATCHES_SOURCE_REPO, DEFAULT_PATCHES_SOURCE_REPO)
    } catch {
      return [DEFAULT_PATCHES_SOURCE_REPO]
    }
  })
  const [patchesSourceRepo, setPatchesSourceRepo] = useState(DEFAULT_PATCHES_SOURCE_REPO)
  const [patchesSourceRepoDraft, setPatchesSourceRepoDraft] = useState("")
  const [patchesSourceVersions, setPatchesSourceVersions] = useState([])
  const [patchesSourceVersion, setPatchesSourceVersion] = useState("")
  const [patchesSourceLoading, setPatchesSourceLoading] = useState(false)
  const [patchesSourceDownloading, setPatchesSourceDownloading] = useState(false)
  const [appTemplateLoading, setAppTemplateLoading] = useState(false)
  const [appVersionOptions, setAppVersionOptions] = useState({})
  const [appVersionLoadingId, setAppVersionLoadingId] = useState("")
  const [appPatchOptions, setAppPatchOptions] = useState({})
  const [appUnsupportedPatches, setAppUnsupportedPatches] = useState({})
  const [appPatchLoadingId, setAppPatchLoadingId] = useState("")
  const [appVersionError, setAppVersionError] = useState("")
  const [appPatchError, setAppPatchError] = useState("")
  const [appLocalApkFiles, setAppLocalApkFiles] = useState([])
  const [appLocalApkLoading, setAppLocalApkLoading] = useState(false)
  const [appLocalApkDir, setAppLocalApkDir] = useState("")
  const [downloadedApkFiles, setDownloadedApkFiles] = useState([])
  const [downloadedApkDir, setDownloadedApkDir] = useState("")
  const [downloadedApkLoading, setDownloadedApkLoading] = useState(false)
  const [packageMetaMap, setPackageMetaMap] = useState(() => (defaultPackageMetaMap && typeof defaultPackageMetaMap === "object" ? defaultPackageMetaMap : {}))

  const [isBusy, setIsBusy] = useState(false)
  const [message, setSidebarMessage] = useState("")
  const setMessage = (value) => {
    const text = String(value ?? "").trim()
    if (text) {
      console.log(text)
    }
    setSidebarMessage("")
  }
  const lastSavedSignatureRef = useRef("")

  const generatedToml = useMemo(() => configFormToToml(configForm), [configForm])
  const t = (key, vars = {}) => translate(locale, key, vars)

  function updateConfigSection(sectionKey, patch) {
    setConfigForm((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        ...patch,
      },
    }))
  }

  function updateApp(appId, patch) {
    setConfigForm((prev) => ({
      ...prev,
      apps: prev.apps.map((app) => (app.id === appId ? { ...app, ...patch } : app)),
    }))
  }

  function toggleAppPatch(appId, patchName, checked) {
    const name = String(patchName || "").trim()
    if (!name) return
    setConfigForm((prev) => ({
      ...prev,
      apps: prev.apps.map((app) => {
        if (app.id !== appId) return app
        const current = Array.isArray(app.patches) ? app.patches : []
        const next = new Set(current.map((item) => String(item || "").trim()).filter(Boolean))
        if (checked) {
          next.add(name)
        } else {
          next.delete(name)
        }
        return {
          ...app,
          patches: Array.from(next),
        }
      }),
    }))
  }

  async function appendApp() {
    setAppTemplateLoading(true)
    try {
      const data = await fetchAppTemplates(configPath)
      const templates = Array.isArray(data?.templates) ? data.templates : []
      if (templates.length === 0) {
        setMessage(t("msg.noTemplates"))
        return
      }

      let addedCount = 0
      let renamedCount = 0
      setConfigForm((prev) => {
        const existingSections = new Set(
          prev.apps
            .map((app) =>
              String(app.name || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        )
        const existingPackages = new Set(
          prev.apps
            .map((app) =>
              String(app.packageName || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        )
        const packageIndexByKey = new Map(
          prev.apps
            .map((app, index) => [
              String(app.packageName || "")
                .trim()
                .toLowerCase(),
              index,
            ])
            .filter(([key]) => key.length > 0),
        )
        const nextApps = [...prev.apps]

        for (const template of templates) {
          const packageName = normalizeTemplatePackageName(template)
          const section = hasText(template?.section) ? String(template.section).trim() : packageToSectionName(packageName)
          const label = hasText(template?.label) ? String(template.label).trim() : resolveDisplayName(packageName, section)
          const packageKey = packageName.toLowerCase()
          const sectionKey = section.toLowerCase()

          const existingIndex = packageIndexByKey.get(packageKey)
          if (Number.isInteger(existingIndex)) {
            const existingApp = nextApps[existingIndex]
            const currentSection = String(existingApp?.name || "").trim()
            const currentSectionKey = currentSection.toLowerCase()
            if (hasText(section) && currentSectionKey !== sectionKey && !existingSections.has(sectionKey)) {
              nextApps[existingIndex] = {
                ...existingApp,
                name: section,
                displayName: hasText(label) ? label : existingApp.displayName,
              }
              existingSections.delete(currentSectionKey)
              existingSections.add(sectionKey)
              renamedCount += 1
            }
            continue
          }
          if (existingSections.has(sectionKey)) {
            continue
          }
          nextApps.push(createEmptyApp(section, { packageName, displayName: label }))
          packageIndexByKey.set(packageKey, nextApps.length - 1)
          existingPackages.add(packageKey)
          existingSections.add(sectionKey)
          addedCount += 1
        }

        return addedCount > 0 || renamedCount > 0 ? { ...prev, apps: nextApps } : prev
      })

      if (addedCount > 0 || renamedCount > 0) {
        setMessage(t("msg.templatesLoaded", { added: addedCount, renamed: renamedCount }))
      } else {
        setMessage(t("msg.allTemplatesLoaded"))
      }
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setAppTemplateLoading(false)
    }
  }

  async function loadAppVersions(app) {
    const appId = String(app?.id || "")
    const packageName = String(app?.packageName || "").trim()
    if (!appId || !packageName) {
      setAppVersionError(t("msg.missingPackageForVersion"))
      return
    }
    setAppVersionLoadingId(appId)
    setAppVersionError("")
    try {
      const data = await fetchAppCompatibleVersions(configPath, {
        name: String(app?.name || ""),
        packageName,
        mode: String(app?.mode || "remote"),
      })
      const versions = Array.isArray(data?.versions) ? data.versions.map((value) => String(value).trim()).filter(Boolean) : []
      setAppVersionOptions((prev) => ({
        ...prev,
        [appId]: {
          loaded: true,
          any: !!data?.any,
          versions,
          packageName: String(data?.packageName || packageName),
          patchFileName: String(data?.patchFileName || "").trim(),
        },
      }))
      if (!data?.any && versions.length === 0) {
        setAppVersionError(t("msg.noVersionsKeepAuto"))
      }
    } catch (error) {
      setAppVersionError(error.message || String(error))
    } finally {
      setAppVersionLoadingId("")
    }
  }

  async function loadAppPatchOptions(app, options = {}) {
    const applyDefaultSelection = options && options.applyDefaultSelection === true
    const appId = String(app?.id || "")
    const packageName = String(app?.packageName || "").trim()
    if (!appId || !packageName) {
      setAppPatchError(t("msg.missingPackageForPatch"))
      return
    }
    setAppPatchLoadingId(appId)
    setAppPatchError("")
    try {
      const data = await fetchAppPatchOptions(configPath, {
        name: String(app?.name || ""),
        packageName,
        mode: String(app?.mode || "remote"),
      })
      const entries = Array.isArray(data?.entries) ? data.entries : []
      const supportedNamesLower = new Set(
        entries.map((entry) => String(entry?.name || "").trim().toLowerCase()).filter(Boolean),
      )
      const selectedNames = Array.isArray(app?.patches) ? app.patches.map((name) => String(name || "").trim()).filter(Boolean) : []
      const unsupportedNames = selectedNames.filter((name) => !supportedNamesLower.has(String(name || "").trim().toLowerCase()))
      setAppPatchOptions((prev) => ({
        ...prev,
        [appId]: {
          entries,
          packageName: String(data?.packageName || packageName),
          patchFileName: String(data?.patchFileName || "").trim(),
        },
      }))
      setAppUnsupportedPatches((prev) => ({
        ...prev,
        [appId]: unsupportedNames,
      }))
      if (applyDefaultSelection) {
        if (entries.length === 0) {
          setMessage(locale === "zh-TW" ? "未查到可用補丁，保留目前勾選。" : "No patch entries found. Keeping current selections.")
          return
        }
        const explicitDefaultNames = entries
          .filter((entry) => {
            if (!entry) return false
            const value = entry.enabled
            if (value === true) return true
            if (typeof value === "string" && value.trim().toLowerCase() === "true") return true
            return false
          })
          .map((entry) => String(entry.name || "").trim())
          .filter(Boolean)

        const inferredDefaultNames =
          explicitDefaultNames.length > 0
            ? []
            : entries
                .filter((entry) => entry && entry.hasCompatiblePackages === true)
                .map((entry) => String(entry.name || "").trim())
                .filter(Boolean)

        const nextDefaultNames = explicitDefaultNames.length > 0 ? explicitDefaultNames : inferredDefaultNames

        if (nextDefaultNames.length === 0) {
          setMessage(locale === "zh-TW" ? "目前 mpp 無可用預設補丁，保留目前勾選。" : "No usable default patches found in current mpp. Keeping current selections.")
          return
        }
        updateApp(appId, {
          patchesMode: "custom",
          patches: nextDefaultNames,
        })
        setMessage(
          explicitDefaultNames.length > 0
            ? locale === "zh-TW"
              ? `已套用 mpp 預設補丁：${nextDefaultNames.length} 項`
              : `Applied mpp default patches: ${nextDefaultNames.length} items`
            : locale === "zh-TW"
              ? `未提供 enabled=true，已依相容補丁推導預設：${nextDefaultNames.length} 項`
              : `No enabled=true found. Applied inferred defaults from compatible patches: ${nextDefaultNames.length} items`,
        )
        setAppUnsupportedPatches((prev) => ({
          ...prev,
          [appId]: [],
        }))
      }
      if (entries.length === 0) {
        setAppPatchError(t("msg.noPatches"))
      }
    } catch (error) {
      setAppPatchError(error.message || String(error))
    } finally {
      setAppPatchLoadingId("")
    }
  }

  async function loadAppLocalApkFiles(app) {
    setAppLocalApkLoading(true)
    try {
      const data = await listDownloadedApks()
      const files = sortFilesByVersion(Array.isArray(data?.files) ? data.files : [])
      setAppLocalApkFiles(files)
      setAppLocalApkDir(String(data?.dir || ""))
      const targetApp = app && typeof app === "object" ? app : null
      if (!targetApp || String(targetApp.mode || "").toLowerCase() !== "local") return
      if (hasText(targetApp.localApkCustomPath)) return
      const selected = String(targetApp.localApkSelectedPath || "").trim()
      const hasSelected = files.some((file) => String(file?.fullPath || "") === selected)
      if (hasSelected) return
      const firstPath = files.length > 0 ? String(files[0].fullPath || "") : ""
      updateApp(targetApp.id, {
        localApkSelectedPath: firstPath,
      })
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setAppLocalApkLoading(false)
    }
  }

  async function loadDownloadedApkFiles() {
    setDownloadedApkLoading(true)
    try {
      const data = await listDownloadedApks()
      const files = sortFilesByVersion(Array.isArray(data?.files) ? data.files : [])
      setDownloadedApkFiles(files)
      setDownloadedApkDir(String(data?.dir || ""))
    } catch (error) {
      setDownloadedApkFiles([])
      setDownloadedApkDir("")
      setMessage(error.message || String(error))
    } finally {
      setDownloadedApkLoading(false)
    }
  }

  async function onBrowseAppLocalApkPath(app) {
    if (!app || !app.id) return
    try {
      const current = hasText(app.localApkCustomPath) ? app.localApkCustomPath : app.localApkSelectedPath
      const data = await browseLocalApkPath(current)
      if (!data || data.canceled || !hasText(data.path)) return
      updateApp(app.id, { localApkCustomPath: String(data.path) })
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

async function refreshTasks() {
    const data = await listTasks(80)
    const next = Array.isArray(data.tasks) ? data.tasks : []
    setTasks(next)
    if (!selectedTaskId && next.length > 0) setSelectedTaskId(next[0].id)

    const activeBuild = next.find((task) => {
      const status = String(task.status || "").toLowerCase()
      return isBuildTask(task) && (status === "running" || status === "stopping")
    })
    const currentLive = liveTaskId ? next.find((task) => String(task.id || "") === String(liveTaskId)) : null
    const currentLiveStatus = String(currentLive?.status || "").toLowerCase()
    const currentLiveFinished = !!currentLive && !["running", "stopping"].includes(currentLiveStatus)
    if (activeBuild) {
      setLiveTaskId(activeBuild.id)
      setLiveTask(activeBuild)
      if (!selectedTaskId) {
        setSelectedTaskId(activeBuild.id)
      }
      return
    }

    if (currentLive) {
      setLiveTask(currentLive)
      if (currentLiveFinished) {
        setLiveTaskId("")
      }
      return
    }

    if (liveTaskId) {
      setLiveTaskId("")
      setLiveTask(null)
    }
  }

  async function loadConfig() {
    setIsBusy(true)
    try {
      const data = await fetchConfig(configPath)
      const content = String(data.content || "")
      const resolvedPath = String(data.path || configPath)
      const nextForm = configFormFromToml(content)
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(nextForm)
      setMorpheSourceRepoOptions(mergeRepoOptions(nextForm?.morpheCli?.repoOptions, nextForm?.morpheCli?.patchesRepo, DEFAULT_MORPHE_SOURCE_REPO))
      setPatchesSourceRepoOptions(mergeRepoOptions(nextForm?.patches?.repoOptions, nextForm?.patches?.patchesRepo, DEFAULT_PATCHES_SOURCE_REPO))
      lastSavedSignatureRef.current = `${resolvedPath}\n${content}`
      setConfigLoaded(true)
      setMessage(`Config loaded: ${data.path}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function onToggleRawMode() {
    if (rawOverrideMode) {
      setRawOverrideMode(false)
      return
    }
    setIsBusy(true)
    try {
      const data = await fetchConfig(configPath)
      const content = String(data.content || "")
      const resolvedPath = String(data.path || configPath)
      const nextForm = configFormFromToml(content)
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(nextForm)
      setMorpheSourceRepoOptions(mergeRepoOptions(nextForm?.morpheCli?.repoOptions, nextForm?.morpheCli?.patchesRepo, DEFAULT_MORPHE_SOURCE_REPO))
      setPatchesSourceRepoOptions(mergeRepoOptions(nextForm?.patches?.repoOptions, nextForm?.patches?.patchesRepo, DEFAULT_PATCHES_SOURCE_REPO))
      lastSavedSignatureRef.current = `${resolvedPath}\n${content}`
      setConfigLoaded(true)
      setRawOverrideMode(true)
      setMessage(`Raw reloaded latest config: ${resolvedPath}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function loadMorpheLocalFiles() {
    try {
      const data = await listSourceFiles("morphe-cli")
      setMorpheLocalFiles(sortFilesByVersion(Array.isArray(data?.files) ? data.files : []))
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  async function loadMorpheSourceVersions(repoOverride = "") {
    const repo = String(repoOverride || morpheSourceRepo || "").trim()
    if (!repo) {
      setMorpheSourceVersions([])
      setMorpheSourceVersion("")
      return
    }
    setMorpheSourceLoading(true)
    try {
      const data = await fetchSourceVersions({
        type: "morphe-cli",
        repo,
      })
      const versions = dedupeSourceVersions(data?.versions)
      const localFileNameSet = new Set(
        morpheLocalFiles
          .map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase())
          .filter(Boolean),
      )
      const firstUndownloaded = versions.find(
        (item) => !localFileNameSet.has(String(item?.fileName || "").trim().toLowerCase()),
      )
      setMorpheSourceVersions(versions)
      setMorpheSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
    } catch (error) {
      setMorpheSourceVersions([])
      setMorpheSourceVersion("")
      setMessage(error.message || String(error))
    } finally {
      setMorpheSourceLoading(false)
    }
  }

  function onAddMorpheSourceRepo() {
    const repo = String(morpheSourceRepoDraft || "").trim()
    if (!repo) return
    const nextOptions = mergeRepoOptions(morpheSourceRepoOptions, repo, DEFAULT_MORPHE_SOURCE_REPO)
    setMorpheSourceRepoOptions(nextOptions)
    setMorpheSourceRepo(repo)
    updateConfigSection("morpheCli", { repoOptions: nextOptions })
    loadMorpheSourceVersions(repo)
    setMorpheSourceRepoDraft("")
  }

  function onSelectMorpheSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(morpheSourceRepoOptions, value, DEFAULT_MORPHE_SOURCE_REPO)
    setMorpheSourceRepoOptions(nextOptions)
    updateConfigSection("morpheCli", { repoOptions: nextOptions })
    setMorpheSourceRepo(repo)
    loadMorpheSourceVersions(repo)
  }

  function onDeleteMorpheSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === DEFAULT_MORPHE_SOURCE_REPO.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      morpheSourceRepoOptions.filter((item) => String(item || "").trim().toLowerCase() !== target.toLowerCase()),
      "",
      DEFAULT_MORPHE_SOURCE_REPO,
    )
    const currentSelected = String(morpheSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || DEFAULT_MORPHE_SOURCE_REPO) : currentSelected
    setMorpheSourceRepoOptions(nextOptions)
    setMorpheSourceRepo(nextRepo)
    updateConfigSection("morpheCli", {
      repoOptions: nextOptions,
    })
  }

  async function loadPatchesSourceVersions(repoOverride = "") {
    const repo = String(repoOverride || patchesSourceRepo || "").trim()
    if (!repo) {
      setPatchesSourceVersions([])
      setPatchesSourceVersion("")
      return
    }
    setPatchesSourceLoading(true)
    try {
      const data = await fetchSourceVersions({
        type: "patches",
        repo,
      })
      const versions = dedupeSourceVersions(data?.versions)
      const localFileNameSet = new Set(
        patchesLocalFiles
          .map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase())
          .filter(Boolean),
      )
      const firstUndownloaded = versions.find(
        (item) => !localFileNameSet.has(String(item?.fileName || "").trim().toLowerCase()),
      )
      setPatchesSourceVersions(versions)
      setPatchesSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
    } catch (error) {
      setPatchesSourceVersions([])
      setPatchesSourceVersion("")
      setMessage(error.message || String(error))
    } finally {
      setPatchesSourceLoading(false)
    }
  }

  function onAddPatchesSourceRepo() {
    const repo = String(patchesSourceRepoDraft || "").trim()
    if (!repo) return
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, repo, DEFAULT_PATCHES_SOURCE_REPO)
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(repo)
    updateConfigSection("patches", { repoOptions: nextOptions })
    loadPatchesSourceVersions(repo)
    setPatchesSourceRepoDraft("")
  }

  function onSelectPatchesSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, value, DEFAULT_PATCHES_SOURCE_REPO)
    setPatchesSourceRepoOptions(nextOptions)
    updateConfigSection("patches", { repoOptions: nextOptions })
    setPatchesSourceRepo(repo)
    loadPatchesSourceVersions(repo)
  }

  function onDeletePatchesSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === DEFAULT_PATCHES_SOURCE_REPO.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      patchesSourceRepoOptions.filter((item) => String(item || "").trim().toLowerCase() !== target.toLowerCase()),
      "",
      DEFAULT_PATCHES_SOURCE_REPO,
    )
    const currentSelected = String(patchesSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || DEFAULT_PATCHES_SOURCE_REPO) : currentSelected
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(nextRepo)
    updateConfigSection("patches", {
      repoOptions: nextOptions,
    })
  }

  async function loadPatchesLocalFiles() {
    try {
      const data = await listSourceFiles("patches")
      setPatchesLocalFiles(sortFilesByVersion(Array.isArray(data?.files) ? data.files : []))
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  function openConfirmDialog(action, title, description, payload = null) {
    setConfirmDialog({
      open: true,
      action: String(action || ""),
      title: String(title || t("confirm.title")),
      description: String(description || ""),
      payload,
    })
  }

  function closeConfirmDialog() {
    if (confirmDialogBusy) return
    setConfirmDialog((prev) => ({ ...prev, open: false }))
  }

  async function onDeleteMorpheFile(file) {
    const relativePath = String(file?.relativePath || file?.name || "").trim()
    const fileName = String(file?.name || "").trim()
    if (!relativePath) return
    setMorpheDeleteName(relativePath)
    try {
      await deleteSourceFile("morphe-cli", relativePath)
      const current = pickSourceFileName(configForm.morpheCli.path)
      if (current === fileName) {
        updateConfigSection("morpheCli", { path: "" })
      }
      await loadMorpheLocalFiles()
      setMessage(t("msg.deleted", { name: relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheDeleteName("")
    }
  }

  async function onDeletePatchesFile(file) {
    const relativePath = String(file?.relativePath || file?.name || "").trim()
    const fileName = String(file?.name || "").trim()
    if (!relativePath) return
    setPatchesDeleteName(relativePath)
    try {
      await deleteSourceFile("patches", relativePath)
      const current = pickSourceFileName(configForm.patches.path)
      if (current === fileName) {
        updateConfigSection("patches", { path: "" })
      }
      await loadPatchesLocalFiles()
      setMessage(t("msg.deleted", { name: relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setPatchesDeleteName("")
    }
  }

  async function onDownloadMorpheFromSource(versionOverride = "") {
    const targetVersion = hasText(versionOverride) ? String(versionOverride).trim() : String(morpheSourceVersion || "").trim()
    if (!hasText(morpheSourceRepo) || !hasText(targetVersion)) return
    setMorpheSourceDownloading(true)
    try {
      const data = await fetchAndSaveSource({
        type: "morphe-cli",
        mode: "stable",
        patchesRepo: morpheSourceRepo,
        version: targetVersion,
      })
      await loadMorpheLocalFiles()
      if (hasText(data?.fullPath)) {
        updateConfigSection("morpheCli", { path: String(data.fullPath) })
      }
      setMorpheSourceVersion("")
      setMessage(t("msg.downloadSaved", { name: data.fileName }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheSourceDownloading(false)
    }
  }

  async function onDownloadPatchesFromSource(versionOverride = "") {
    const targetVersion = hasText(versionOverride) ? String(versionOverride).trim() : String(patchesSourceVersion || "").trim()
    if (!hasText(patchesSourceRepo) || !hasText(targetVersion)) return
    setPatchesSourceDownloading(true)
    try {
      const data = await fetchAndSaveSource({
        type: "patches",
        mode: "stable",
        patchesRepo: patchesSourceRepo,
        version: targetVersion,
      })
      await loadPatchesLocalFiles()
      if (hasText(data?.fullPath)) {
        updateConfigSection("patches", { path: String(data.fullPath) })
      }
      setPatchesSourceVersion("")
      setMessage(t("msg.downloadSaved", { name: data.fileName }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setPatchesSourceDownloading(false)
    }
  }

  async function onBuildPrimaryAction() {
    if (isBuildRunning || isBuildStopping || buildLaunchPending) {
      await onStopBuildTask()
      return
    }
    await runTask(TASK_MODE_BUILD, {
      dryRun: false,
      force: false,
    })
  }

  async function runTask(mode, flags = DEFAULT_FLAGS) {
    const isBuildRunningNow = String(liveTask?.status || "").toLowerCase() === "running"
    if (mode === TASK_MODE_BUILD && (isBuildRunningNow || buildLaunchPending)) {
      setMessage(t("msg.buildAlreadyRunning"))
      return
    }
    if (mode === TASK_MODE_BUILD) {
      const missingLocalApkApp = (configForm.apps || []).find((app) => {
        if (String(app?.mode || "").toLowerCase() !== "local") return false
        return !hasText(app?.localApkCustomPath) && !hasText(app?.localApkSelectedPath)
      })
      if (missingLocalApkApp) {
        const appName = missingLocalApkApp.displayName || missingLocalApkApp.name || "app"
        setMessage(locale === "zh-TW" ? `[${appName}] local 模式需先選擇本地 APK 或輸入自訂路徑。` : `[${appName}] local mode requires a selected local APK or custom path.`)
        return
      }
    }
    setIsBusy(true)
    if (mode === TASK_MODE_BUILD) {
      setBuildLaunchPending(true)
    }
    try {
      const payload = buildTaskPayload(configPath, mode, flags)
      const data = await startTask(payload)
      if (data?.task) {
        setSelectedTaskId(data.task.id)
        if (mode === TASK_MODE_BUILD) {
          setLiveTaskId(data.task.id)
          setLiveTask(data.task)
          localStorage.setItem(LIVE_BUILD_TASK_ID_KEY, data.task.id)
        }
      }
      setMessage(t("msg.taskStarted"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
      if (mode === TASK_MODE_BUILD) {
        setBuildLaunchPending(false)
      }
    }
  }

  async function onStopBuildTask() {
    if (!liveTaskId) return
    try {
      setLiveTask((prev) => (prev ? { ...prev, status: "stopping", stopRequested: true } : prev))
      const data = await stopTask(liveTaskId)
      if (data && data.task) {
        setLiveTask(data.task)
      }
      setMessage(t("msg.stopRequested"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  useEffect(() => {
    loadConfig()
    refreshTasks()
    const persistedId = localStorage.getItem(LIVE_BUILD_TASK_ID_KEY)
    if (persistedId) {
      setLiveTaskId(persistedId)
      setSelectedTaskId((prev) => prev || persistedId)
    }
  }, [])

  useEffect(() => {
    let canceled = false
    fetchPackageMap()
      .then((data) => {
        if (canceled) return
        if (data && typeof data.map === "object" && data.map) {
          setPackageMetaMap(data.map)
        }
      })
      .catch(() => {})
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (!configLoaded) return undefined
    const content = rawOverrideMode ? rawConfigInput : generatedToml
    const signature = `${configPath}\n${content}`
    if (signature === lastSavedSignatureRef.current) {
      return undefined
    }

    const timer = setTimeout(async () => {
      setIsAutoSavingConfig(true)
      try {
        const data = await saveConfig({ path: configPath, content })
        const resolvedPath = String(data.path || configPath)
        lastSavedSignatureRef.current = `${resolvedPath}\n${content}`
        if (resolvedPath !== configPath) {
          setConfigPath(resolvedPath)
        }
        setMessage(t("msg.autoSavedConfig", { path: resolvedPath }))
      } catch (error) {
        setMessage(error.message || String(error))
      } finally {
        setIsAutoSavingConfig(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [configLoaded, rawOverrideMode, rawConfigInput, generatedToml])

  useEffect(() => {
    const timer = setInterval(() => {
      refreshTasks().catch(() => {})
    }, 4000)
    return () => clearInterval(timer)
  }, [selectedTaskId])

  useEffect(() => {
    if (!selectedTaskId) return undefined

    let canceled = false
    async function refreshSelected() {
      try {
        const [taskRes, logRes, artifactsRes] = await Promise.allSettled([
          fetchTask(selectedTaskId),
          fetchTaskLog(selectedTaskId, 500),
          fetchTaskArtifacts(selectedTaskId),
        ])
        if (canceled) return

        if (taskRes.status === "fulfilled") {
          const selected = taskRes.value.task || null
          if (!selected) {
            setSelectedTaskId("")
            setSelectedTask(null)
            setTaskLog("")
            setTaskArtifacts([])
            setTaskOutputDir("")
            return
          }
          setSelectedTask(selected)
        } else if (isNotFoundError(taskRes.reason)) {
          setSelectedTaskId("")
          setSelectedTask(null)
          setTaskLog("")
          setTaskArtifacts([])
          setTaskOutputDir("")
          return
        } else {
          setMessage(taskRes.reason?.message || String(taskRes.reason))
        }

        if (logRes.status === "fulfilled") {
          setTaskLog(String(logRes.value?.content || ""))
        }
        if (artifactsRes.status === "fulfilled") {
          setTaskArtifacts(Array.isArray(artifactsRes.value?.artifacts) ? artifactsRes.value.artifacts : [])
          setTaskOutputDir(String(artifactsRes.value?.outputDir || ""))
        }
      } catch (error) {
        if (canceled) return
        if (isNotFoundError(error)) {
          setSelectedTaskId("")
          setSelectedTask(null)
          setTaskLog("")
          setTaskArtifacts([])
          setTaskOutputDir("")
          return
        }
        setMessage(error.message || String(error))
      }
    }

    refreshSelected()
    const timer = setInterval(refreshSelected, 2000)
    return () => {
      canceled = true
      clearInterval(timer)
    }
  }, [selectedTaskId])

  async function onOpenSelectedTaskOutputDir() {
    if (!selectedTaskId) return
    setOpeningTaskFolder(true)
    try {
      const data = await openTaskOutputDir(selectedTaskId)
      setMessage(t("msg.opened", { path: data.path || taskOutputDir || selectedTaskId }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setOpeningTaskFolder(false)
    }
  }

  async function onOpenArtifactDir(relativePath) {
    if (!selectedTaskId || !relativePath) return
    setOpeningArtifactPath(relativePath)
    try {
      const data = await openTaskArtifactDir(selectedTaskId, relativePath)
      setMessage(t("msg.opened", { path: data.path || relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setOpeningArtifactPath("")
    }
  }

  async function onDeleteTask(taskId) {
    if (!taskId) return
    setDeletingTaskId(taskId)
    try {
      await deleteTask(taskId)
      if (selectedTaskId === taskId) {
        setSelectedTaskId("")
        setSelectedTask(null)
        setTaskLog("")
        setTaskArtifacts([])
        setTaskOutputDir("")
        setTaskDetailDialogOpen(false)
      }
      setMessage(t("msg.deletedTask", { id: taskId }))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setDeletingTaskId("")
    }
  }

  async function onDeleteAllTasks() {
    setDeletingAllTasks(true)
    try {
      await deleteAllTasks()
      setSelectedTaskId("")
      setSelectedTask(null)
      setTaskLog("")
      setTaskArtifacts([])
      setTaskOutputDir("")
      setTaskDetailDialogOpen(false)
      setMessage(t("msg.deletedAllTasks"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setDeletingAllTasks(false)
    }
  }

  async function onClearAllCache() {
    setClearingAllCache(true)
    try {
      const data = await clearAllCache()
      setMessage(t("msg.cacheCleared", { path: data.path || "-" }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setClearingAllCache(false)
    }
  }

  useEffect(() => {
    if (!liveTaskId) return undefined

    let canceled = false
    async function refreshLiveTask() {
      try {
        const taskData = await fetchTask(liveTaskId)
        if (canceled) return
        const nextTask = taskData.task || null
        if (!nextTask) {
          setLiveTaskId("")
          setLiveTask(null)
          setLiveTaskLog("")
          return
        }
        const nextStatus = String(nextTask?.status || "").toLowerCase()
        setLiveTask(nextTask)
        try {
          const logData = await fetchTaskLog(liveTaskId, 500)
          if (!canceled) {
            setLiveTaskLog(String(logData?.content || ""))
          }
        } catch {
          // Keep status syncing even if log fetch is temporarily unavailable.
        }
        if (nextTask && !["running", "stopping"].includes(nextStatus)) {
          setLiveTaskId("")
        }
      } catch (error) {
        if (canceled) return
        if (isNotFoundError(error)) {
          setLiveTaskId("")
          setLiveTask(null)
          setLiveTaskLog("")
          return
        }
        setMessage(error.message || String(error))
      }
    }

    refreshLiveTask()
    const timer = setInterval(refreshLiveTask, 1500)
    return () => {
      canceled = true
      clearInterval(timer)
    }
  }, [liveTaskId])

  async function onConfirmDialogAction() {
    const action = String(confirmDialog.action || "")
    const payload = confirmDialog.payload
    if (!action) return
    setConfirmDialogBusy(true)
    try {
      if (action === "delete-morphe-file") {
        await onDeleteMorpheFile(payload)
      } else if (action === "delete-patches-file") {
        await onDeletePatchesFile(payload)
      } else if (action === "delete-task") {
        await onDeleteTask(String(payload || ""))
      } else if (action === "delete-all-tasks") {
        await onDeleteAllTasks()
      } else if (action === "clear-all-cache") {
        await onClearAllCache()
      }
      setConfirmDialog((prev) => ({ ...prev, open: false }))
    } finally {
      setConfirmDialogBusy(false)
    }
  }

  useEffect(() => {
    if (!liveTaskId) {
      localStorage.removeItem(LIVE_BUILD_TASK_ID_KEY)
      return
    }
    localStorage.setItem(LIVE_BUILD_TASK_ID_KEY, liveTaskId)
  }, [liveTaskId])

  useEffect(() => {
    localStorage.setItem(MORPHE_SOURCE_REPOS_KEY, JSON.stringify(morpheSourceRepoOptions))
  }, [morpheSourceRepoOptions])

  useEffect(() => {
    localStorage.setItem(PATCHES_SOURCE_REPOS_KEY, JSON.stringify(patchesSourceRepoOptions))
  }, [patchesSourceRepoOptions])

  useEffect(() => {
    const status = String(liveTask?.status || "").toLowerCase()
    if (!status) return
    if (["running", "stopping"].includes(status)) return
    setBuildLaunchPending(false)
  }, [liveTask?.status])

  useEffect(() => {
    if (morpheSettingsOpen) {
      const nextOptions = mergeRepoOptions(configForm?.morpheCli?.repoOptions, "", DEFAULT_MORPHE_SOURCE_REPO)
      const current = String(morpheSourceRepo || "").trim().toLowerCase()
      const hasCurrent = nextOptions.some((item) => String(item || "").trim().toLowerCase() === current)
      const nextRepo = hasCurrent ? morpheSourceRepo : String(nextOptions[0] || DEFAULT_MORPHE_SOURCE_REPO)
      setMorpheSourceRepoOptions(nextOptions)
      setMorpheSourceRepo(nextRepo)
      loadMorpheLocalFiles()
    }
  }, [morpheSettingsOpen])

  useEffect(() => {
    if (morpheSettingsOpen) {
      loadMorpheSourceVersions()
    }
  }, [morpheSettingsOpen, morpheSourceRepo])

  useEffect(() => {
    if (patchesSettingsOpen) {
      const nextOptions = mergeRepoOptions(configForm?.patches?.repoOptions, "", DEFAULT_PATCHES_SOURCE_REPO)
      const current = String(patchesSourceRepo || "").trim().toLowerCase()
      const hasCurrent = nextOptions.some((item) => String(item || "").trim().toLowerCase() === current)
      const nextRepo = hasCurrent ? patchesSourceRepo : String(nextOptions[0] || DEFAULT_PATCHES_SOURCE_REPO)
      setPatchesSourceRepoOptions(nextOptions)
      setPatchesSourceRepo(nextRepo)
      loadPatchesLocalFiles()
    }
  }, [patchesSettingsOpen])

  useEffect(() => {
    if (patchesSettingsOpen) {
      loadPatchesSourceVersions()
    }
  }, [patchesSettingsOpen, patchesSourceRepo])

  useEffect(() => {
    if (activeNav !== NAV_ASSETS) return
    loadMorpheLocalFiles()
    loadPatchesLocalFiles()
    loadMorpheSourceVersions()
    loadPatchesSourceVersions()
    loadDownloadedApkFiles()
  }, [activeNav])

  const editingApp = useMemo(() => configForm.apps.find((app) => app.id === appSettingsId) || null, [configForm.apps, appSettingsId])

  useEffect(() => {
    if (!appSettingsOpen || !editingApp) return
    loadAppVersions(editingApp)
    loadAppPatchOptions(editingApp)
    loadAppLocalApkFiles(editingApp)
  }, [appSettingsOpen, editingApp?.id])

  useEffect(() => {
    if (!appSettingsOpen || !editingApp) return
    if (String(editingApp.mode || "").toLowerCase() !== "local") return
    loadAppLocalApkFiles(editingApp)
  }, [appSettingsOpen, editingApp?.id, editingApp?.mode])

  const navItems = [
    { key: NAV_BUILD, label: t("nav.build"), icon: Hammer },
    { key: NAV_ASSETS, label: t("nav.assets"), icon: Database },
    { key: NAV_HISTORY, label: t("nav.history"), icon: Archive },
  ]
  function getPackageIcon(packageName) {
    const key = String(packageName || "")
      .trim()
      .toLowerCase()
    const item = packageMetaMap && typeof packageMetaMap === "object" ? packageMetaMap[key] : null
    if (item && hasText(item.icon)) return String(item.icon).trim()
    return hasText(PACKAGE_NAME_ICON_FALLBACKS[key]) ? String(PACKAGE_NAME_ICON_FALLBACKS[key]).trim() : ""
  }
  function resolvePackageDisplayName(packageName) {
    const key = String(packageName || "")
      .trim()
      .toLowerCase()
    const item = packageMetaMap && typeof packageMetaMap === "object" ? packageMetaMap[key] : null
    if (item && hasText(item.label)) return String(item.label).trim()
    if (key === "__unknown__") return t("assets.unknownPackage")
    return resolveDisplayName(key, key)
  }
  const liveTaskStatus = String(liveTask?.status || "")
  const isBuildRunning = liveTaskStatus.toLowerCase() === "running"
  const isBuildStopping = liveTaskStatus.toLowerCase() === "stopping"
  const liveLastLine = useMemo(() => {
    const lines = String(liveTaskLog || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.length > 0 ? lines[lines.length - 1] : ""
  }, [liveTaskLog])

  return (
    <div className='shell-layout'>
      <aside className='left-panel space-y-4'>
        <div>
          <h1 className='text-lg font-semibold'>Morphe Console</h1>
          <p className='text-sm text-muted-foreground'>{t("sidebar.subtitle")}</p>
        </div>

        <Separator />

        <nav className='space-y-2'>
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeNav === item.key
            return (
              <button
                key={item.key}
                type='button'
                className={cn("sidebar-btn", active ? "sidebar-btn-active" : "sidebar-btn-idle")}
                onClick={() => setActiveNav(item.key)}>
                <Icon className='h-5 w-5' />
                {item.label}
              </button>
            )
          })}
        </nav>

        <Separator />
        <div className='space-y-2'>
          <Label className='text-xs text-muted-foreground inline-flex items-center gap-1.5'>
            <Globe className='h-3.5 w-3.5' />
            {t("sidebar.language")}
          </Label>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className='h-9'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />
        {hasText(message) ? <p className='text-xs text-muted-foreground break-words'>{message}</p> : null}
      </aside>

      <main className='main-panel space-y-4'>
        {activeNav === NAV_BUILD ? (
          <BuildPage
            t={t}
            isBuildRunning={isBuildRunning}
            buildLaunchPending={buildLaunchPending}
            isBuildStopping={isBuildStopping}
            liveLastLine={liveLastLine}
            setLogDialogOpen={setLogDialogOpen}
            liveTaskId={liveTaskId}
            onStopBuildTask={onStopBuildTask}
            onBuildPrimaryAction={onBuildPrimaryAction}
            rawOverrideMode={rawOverrideMode}
            onToggleRawMode={onToggleRawMode}
            isBusy={isBusy}
            setConfigPathDialogOpen={setConfigPathDialogOpen}
            loadConfig={loadConfig}
            setRawConfigInput={setRawConfigInput}
            generatedToml={generatedToml}
            rawConfigInput={rawConfigInput}
            setRawConfigInputValue={setRawConfigInput}
            setMorpheSettingsOpen={setMorpheSettingsOpen}
            setPatchesSettingsOpen={setPatchesSettingsOpen}
            appendApp={appendApp}
            appTemplateLoading={appTemplateLoading}
            apps={configForm.apps}
            updateApp={updateApp}
            getPackageIcon={getPackageIcon}
            hasText={hasText}
            setAppSettingsId={setAppSettingsId}
            setAppSettingsOpen={setAppSettingsOpen}
          />
        ) : null}

        {activeNav === NAV_ASSETS ? (
          <AssetsPage
            t={t}
            hasText={hasText}
            formatBytes={formatBytes}
            morpheSourceRepo={morpheSourceRepo}
            morpheSourceRepoOptions={morpheSourceRepoOptions}
            morpheSourceRepoDraft={morpheSourceRepoDraft}
            setMorpheSourceRepoDraft={setMorpheSourceRepoDraft}
            onSelectMorpheSourceRepo={onSelectMorpheSourceRepo}
            onAddMorpheSourceRepo={onAddMorpheSourceRepo}
            morpheSourceVersion={morpheSourceVersion}
            setMorpheSourceVersion={setMorpheSourceVersion}
            morpheSourceVersions={morpheSourceVersions}
            onDownloadMorpheFromSource={onDownloadMorpheFromSource}
            morpheSourceLoading={morpheSourceLoading}
            morpheSourceDownloading={morpheSourceDownloading}
            loadMorpheSourceVersions={loadMorpheSourceVersions}
            loadMorpheLocalFiles={loadMorpheLocalFiles}
            morpheLocalFiles={morpheLocalFiles}
            openConfirmDialog={openConfirmDialog}
            morpheDeleteName={morpheDeleteName}
            patchesSourceRepo={patchesSourceRepo}
            patchesSourceRepoOptions={patchesSourceRepoOptions}
            patchesSourceRepoDraft={patchesSourceRepoDraft}
            setPatchesSourceRepoDraft={setPatchesSourceRepoDraft}
            onSelectPatchesSourceRepo={onSelectPatchesSourceRepo}
            onAddPatchesSourceRepo={onAddPatchesSourceRepo}
            patchesSourceVersion={patchesSourceVersion}
            setPatchesSourceVersion={setPatchesSourceVersion}
            patchesSourceVersions={patchesSourceVersions}
            onDownloadPatchesFromSource={onDownloadPatchesFromSource}
            patchesSourceLoading={patchesSourceLoading}
            patchesSourceDownloading={patchesSourceDownloading}
            loadPatchesSourceVersions={loadPatchesSourceVersions}
            loadPatchesLocalFiles={loadPatchesLocalFiles}
            patchesLocalFiles={patchesLocalFiles}
            patchesDeleteName={patchesDeleteName}
            downloadedApkFiles={downloadedApkFiles}
            downloadedApkDir={downloadedApkDir}
            downloadedApkLoading={downloadedApkLoading}
            loadDownloadedApkFiles={loadDownloadedApkFiles}
          />
        ) : null}

        {activeNav === NAV_HISTORY ? (
          <HistoryPage
            t={t}
            openConfirmDialog={openConfirmDialog}
            clearingAllCache={clearingAllCache}
            deletingAllTasks={deletingAllTasks}
            refreshTasks={refreshTasks}
            isBusy={isBusy}
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            setSelectedTaskId={setSelectedTaskId}
            setTaskDetailDialogOpen={setTaskDetailDialogOpen}
            formatTaskLabel={formatTaskLabel}
            statusVariant={statusVariant}
            deletingTaskId={deletingTaskId}
          />
        ) : null}

        <TaskDialogs
          t={t}
          logDialogOpen={logDialogOpen}
          setLogDialogOpen={setLogDialogOpen}
          liveTaskId={liveTaskId}
          liveTaskStatus={liveTaskStatus}
          statusVariant={statusVariant}
          liveLastLine={liveLastLine}
          liveTaskLog={liveTaskLog}
          historyLogDialogOpen={historyLogDialogOpen}
          setHistoryLogDialogOpen={setHistoryLogDialogOpen}
          selectedTaskId={selectedTaskId}
          taskLog={taskLog}
          taskDetailDialogOpen={taskDetailDialogOpen}
          setTaskDetailDialogOpen={setTaskDetailDialogOpen}
          taskOutputDir={taskOutputDir}
          selectedTask={selectedTask}
          onOpenSelectedTaskOutputDir={onOpenSelectedTaskOutputDir}
          openingTaskFolder={openingTaskFolder}
          taskArtifacts={taskArtifacts}
          formatBytes={formatBytes}
          onOpenArtifactDir={onOpenArtifactDir}
          openingArtifactPath={openingArtifactPath}
        />

        <ConfigPathDialog open={configPathDialogOpen} onOpenChange={setConfigPathDialogOpen} t={t} configPath={configPath} setConfigPath={setConfigPath} />

        <AppSettingsDialog
          open={appSettingsOpen}
          onOpenChange={(open) => {
            setAppSettingsOpen(open)
            if (!open) {
              setAppSettingsId("")
              setAppVersionError("")
              setAppPatchError("")
              setAppDlurlPopoverOpen(false)
              setAppUnsupportedPatches({})
            }
          }}
          t={t}
          locale={locale}
          editingApp={editingApp}
          appDlurlPopoverOpen={appDlurlPopoverOpen}
          setAppDlurlPopoverOpen={setAppDlurlPopoverOpen}
          appLocalApkFiles={appLocalApkFiles}
          appLocalApkDir={appLocalApkDir}
          appLocalApkLoading={appLocalApkLoading}
          onRefreshAppLocalApkFiles={() => loadAppLocalApkFiles(editingApp)}
          onBrowseAppLocalApkPath={() => onBrowseAppLocalApkPath(editingApp)}
          updateApp={updateApp}
          hasText={hasText}
          appPatchOptions={appPatchOptions}
          appVersionOptions={appVersionOptions}
          appVersionLoadingId={appVersionLoadingId}
          appPatchLoadingId={appPatchLoadingId}
          loadAppVersions={loadAppVersions}
          loadAppPatchOptions={loadAppPatchOptions}
          appVerAutoValue={APP_VER_AUTO_VALUE}
          appVersionError={appVersionError}
          appPatchError={appPatchError}
          appUnsupportedPatches={appUnsupportedPatches}
          getPatchTranslation={getPatchTranslation}
          toggleAppPatch={toggleAppPatch}
        />

        <MorpheSettingsDialog
          open={morpheSettingsOpen}
          onOpenChange={setMorpheSettingsOpen}
          t={t}
          configForm={configForm}
          morpheLocalFiles={morpheLocalFiles}
          morpheStableValue={MORPHE_REMOTE_STABLE_VALUE}
          morpheDevValue={MORPHE_REMOTE_DEV_VALUE}
          updateConfigSection={updateConfigSection}
          formatBytes={formatBytes}
          openConfirmDialog={openConfirmDialog}
          morpheDeleteName={morpheDeleteName}
        />

        <PatchesSettingsDialog
          open={patchesSettingsOpen}
          onOpenChange={setPatchesSettingsOpen}
          t={t}
          configForm={configForm}
          patchesLocalFiles={patchesLocalFiles}
          patchesStableValue={PATCHES_REMOTE_STABLE_VALUE}
          patchesDevValue={PATCHES_REMOTE_DEV_VALUE}
          updateConfigSection={updateConfigSection}
          formatBytes={formatBytes}
          openConfirmDialog={openConfirmDialog}
          patchesDeleteName={patchesDeleteName}
        />

        <ConfirmActionDialog
          open={confirmDialog.open}
          onOpenChange={(open) => (!open ? closeConfirmDialog() : null)}
          title={confirmDialog.title}
          description={confirmDialog.description}
          t={t}
          busy={confirmDialogBusy}
          onCancel={closeConfirmDialog}
          onConfirm={onConfirmDialogAction}
        />
      </main>
    </div>
  )
}

export default App
