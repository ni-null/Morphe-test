import { useEffect, useMemo, useRef, useState } from "react"
import {
  Archive,
  Boxes,
  Cloud,
  Check,
  Code2,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Hammer,
  HardDrive,
  Loader2,
  Package,
  ScrollText,
  Play,
  Plus,
  Pencil,
  Link2,
  RefreshCw,
  Settings2,
  Square,
  Smartphone,
  Trash2,
} from "lucide-react"
import {
  clearAllCache,
  deleteSourceFile,
  deleteAllTasks,
  deleteTask,
  fetchAndSaveSource,
  fetchAppTemplates,
  fetchAppCompatibleVersions,
  fetchPackageMap,
  fetchConfig,
  fetchSourceVersions,
  fetchTask,
  fetchTaskLog,
  fetchTaskArtifacts,
  fetchAppPatchOptions,
  listDownloadedApks,
  listTasks,
  browseLocalApkPath,
  listSourceFiles,
  openTaskArtifactDir,
  openTaskOutputDir,
  saveConfig,
  startTask,
  stopTask,
} from "./api"
import { Button } from "./components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card"
import { Input } from "./components/ui/input"
import { Textarea } from "./components/ui/textarea"
import { Checkbox } from "./components/ui/checkbox"
import { Label } from "./components/ui/label"
import { Badge } from "./components/ui/badge"
import { Separator } from "./components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import { cn } from "./lib/utils"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, t as translate } from "./i18n"
import patchTranslations from "./patch-translations.json"

const NAV_BUILD = "build"
const NAV_HISTORY = "history"

const TASK_MODE_BUILD = "build"
const RESERVED_SECTIONS = new Set(["global", "morphe-cli", "morphe_cli", "patches"])

const DEFAULT_FLAGS = {
  dryRun: true,
  force: false,
}

const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
const UI_LOCALE_KEY = "morphe.ui.locale"
const MORPHE_SOURCE_REPOS_KEY = "morphe.source.repos"
const PATCHES_SOURCE_REPOS_KEY = "patches.source.repos"
const APP_VER_AUTO_VALUE = "__APP_AUTO__"
const MORPHE_REMOTE_STABLE_VALUE = "__MORPHE_REMOTE_STABLE__"
const MORPHE_REMOTE_DEV_VALUE = "__MORPHE_REMOTE_DEV__"
const PATCHES_REMOTE_STABLE_VALUE = "__PATCHES_REMOTE_STABLE__"
const PATCHES_REMOTE_DEV_VALUE = "__PATCHES_REMOTE_DEV__"
const PACKAGE_NAME_LABELS = {
  "com.google.android.apps.youtube.music": "YouTube Music",
  "com.google.android.youtube": "YouTube",
  "com.reddit.frontpage": "Reddit",
}
const PACKAGE_NAME_ICON_FALLBACKS = {
  "com.google.android.youtube": "/assets/apps/youtube.svg",
  "com.google.android.apps.youtube.music": "/assets/apps/youtube-music.svg",
  "com.reddit.frontpage": "/assets/apps/reddit.svg",
}

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
      patchesRepo: "MorpheApp/morphe-cli",
      path: "",
    },
    patches: {
      mode: "stable",
      patchesRepo: "MorpheApp/morphe-patches",
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
  defaults.morpheCli.path = readTomlString(morpheCliCfg, ["path"])

  const patchesMode = readTomlString(patchesCfg, ["mode"]).toLowerCase()
  if (patchesMode === "stable" || patchesMode === "dev" || patchesMode === "local") {
    defaults.patches.mode = patchesMode
  }
  const patchesRepo = readTomlString(patchesCfg, ["patches_repo"])
  if (hasText(patchesRepo)) {
    defaults.patches.patchesRepo = patchesRepo
  }
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
  const morpheLines = buildTomlSectionLines("morphe-cli", morpheEntries)
  if (morpheLines.length) blocks.push(morpheLines)

  const patchesEntries = []
  pushTomlEntry(patchesEntries, "mode", true, configForm.patches.mode || "stable")
  if ((configForm.patches.mode || "stable") === "local") {
    pushTomlEntry(patchesEntries, "path", true, configForm.patches.path)
  } else {
    pushTomlEntry(patchesEntries, "patches_repo", true, configForm.patches.patchesRepo)
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

  const entries = patchTranslations && typeof patchTranslations === "object" ? patchTranslations.entries : null
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
  const [activeNav, setActiveNav] = useState(NAV_BUILD)
  const [locale, setLocale] = useState(() => {
    const stored = String(globalThis?.localStorage?.getItem(UI_LOCALE_KEY) || "").trim()
    return stored === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE
  })

  const [configPath, setConfigPath] = useState("config.toml")
  const [configForm, setConfigForm] = useState(createDefaultConfigForm)
  const [rawConfigInput, setRawConfigInput] = useState("")
  const [rawOverrideMode, setRawOverrideMode] = useState(false)
  const [configPathDialogOpen, setConfigPathDialogOpen] = useState(false)

  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLog, setTaskLog] = useState("")
  const [taskArtifacts, setTaskArtifacts] = useState([])
  const [taskOutputDir, setTaskOutputDir] = useState("")
  const [taskDetailDialogOpen, setTaskDetailDialogOpen] = useState(false)
  const [historyLogDialogOpen, setHistoryLogDialogOpen] = useState(false)
  const [deletingAllTasks, setDeletingAllTasks] = useState(false)
  const [clearingAllCache, setClearingAllCache] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState("")
  const [openingTaskFolder, setOpeningTaskFolder] = useState(false)
  const [openingArtifactPath, setOpeningArtifactPath] = useState("")
  const [liveTaskId, setLiveTaskId] = useState("")
  const [liveTask, setLiveTask] = useState(null)
  const [liveTaskLog, setLiveTaskLog] = useState("")
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [buildLaunchPending, setBuildLaunchPending] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [appSettingsId, setAppSettingsId] = useState("")
  const [morpheSettingsOpen, setMorpheSettingsOpen] = useState(false)
  const [patchesSettingsOpen, setPatchesSettingsOpen] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [isAutoSavingConfig, setIsAutoSavingConfig] = useState(false)
  const [morpheLocalFiles, setMorpheLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [morpheDeleteName, setMorpheDeleteName] = useState("")
  const [patchesDeleteName, setPatchesDeleteName] = useState("")
  const [morpheSourceRepoOptions, setMorpheSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(MORPHE_SOURCE_REPOS_KEY) || "")
      if (!raw) return ["MorpheApp/morphe-cli"]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, "MorpheApp/morphe-cli", "MorpheApp/morphe-cli")
    } catch {
      return ["MorpheApp/morphe-cli"]
    }
  })
  const [morpheSourceRepo, setMorpheSourceRepo] = useState("MorpheApp/morphe-cli")
  const [morpheSourceRepoDraft, setMorpheSourceRepoDraft] = useState("")
  const [morpheSourceVersions, setMorpheSourceVersions] = useState([])
  const [morpheSourceVersion, setMorpheSourceVersion] = useState("")
  const [morpheSourceLoading, setMorpheSourceLoading] = useState(false)
  const [morpheSourceDownloading, setMorpheSourceDownloading] = useState(false)
  const [morpheSourcePopoverOpen, setMorpheSourcePopoverOpen] = useState(false)
  const [patchesSourceRepoOptions, setPatchesSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(PATCHES_SOURCE_REPOS_KEY) || "")
      if (!raw) return ["MorpheApp/morphe-patches"]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, "MorpheApp/morphe-patches", "MorpheApp/morphe-patches")
    } catch {
      return ["MorpheApp/morphe-patches"]
    }
  })
  const [patchesSourceRepo, setPatchesSourceRepo] = useState("MorpheApp/morphe-patches")
  const [patchesSourceRepoDraft, setPatchesSourceRepoDraft] = useState("")
  const [patchesSourceVersions, setPatchesSourceVersions] = useState([])
  const [patchesSourceVersion, setPatchesSourceVersion] = useState("")
  const [patchesSourceLoading, setPatchesSourceLoading] = useState(false)
  const [patchesSourceDownloading, setPatchesSourceDownloading] = useState(false)
  const [patchesSourcePopoverOpen, setPatchesSourcePopoverOpen] = useState(false)
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
  const [appDlurlPopoverOpen, setAppDlurlPopoverOpen] = useState(false)
  const [packageMetaMap, setPackageMetaMap] = useState({})

  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState("Ready")
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: "",
    title: "",
    description: "",
    payload: null,
  })
  const [confirmDialogBusy, setConfirmDialogBusy] = useState(false)
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
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(configFormFromToml(content))
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
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(configFormFromToml(content))
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

  async function loadMorpheSourceVersions() {
    const repo = String(morpheSourceRepo || "").trim()
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
      const versions = Array.isArray(data?.versions) ? data.versions : []
      setMorpheSourceVersions(versions)
      setMorpheSourceVersion(versions.length > 0 ? String(versions[0].fileName || "") : "")
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
    setMorpheSourceRepoOptions((prev) => mergeRepoOptions(prev, repo, "MorpheApp/morphe-cli"))
    setMorpheSourceRepo(repo)
    updateConfigSection("morpheCli", { patchesRepo: repo })
    setMorpheSourceRepoDraft("")
  }

  async function loadPatchesSourceVersions() {
    const repo = String(patchesSourceRepo || "").trim()
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
      const versions = Array.isArray(data?.versions) ? data.versions : []
      setPatchesSourceVersions(versions)
      setPatchesSourceVersion(versions.length > 0 ? String(versions[0].fileName || "") : "")
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
    setPatchesSourceRepoOptions((prev) => mergeRepoOptions(prev, repo, "MorpheApp/morphe-patches"))
    setPatchesSourceRepo(repo)
    updateConfigSection("patches", { patchesRepo: repo })
    setPatchesSourceRepoDraft("")
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

  async function onDownloadMorpheFromSource() {
    if (!hasText(morpheSourceRepo) || !hasText(morpheSourceVersion)) return
    setMorpheSourceDownloading(true)
    try {
      const data = await fetchAndSaveSource({
        type: "morphe-cli",
        mode: "stable",
        patchesRepo: morpheSourceRepo,
        version: morpheSourceVersion,
      })
      await loadMorpheLocalFiles()
      if (hasText(data?.fullPath)) {
        updateConfigSection("morpheCli", { path: String(data.fullPath) })
      }
      setMessage(t("msg.downloadSaved", { name: data.fileName }))
      setMorpheSourcePopoverOpen(false)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheSourceDownloading(false)
    }
  }

  async function onDownloadPatchesFromSource() {
    if (!hasText(patchesSourceRepo) || !hasText(patchesSourceVersion)) return
    setPatchesSourceDownloading(true)
    try {
      const data = await fetchAndSaveSource({
        type: "patches",
        mode: "stable",
        patchesRepo: patchesSourceRepo,
        version: patchesSourceVersion,
      })
      await loadPatchesLocalFiles()
      if (hasText(data?.fullPath)) {
        updateConfigSection("patches", { path: String(data.fullPath) })
      }
      setMessage(t("msg.downloadSaved", { name: data.fileName }))
      setPatchesSourcePopoverOpen(false)
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
    localStorage.setItem(UI_LOCALE_KEY, locale)
  }, [locale])

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
      const nextRepo = hasText(configForm.morpheCli.patchesRepo) ? configForm.morpheCli.patchesRepo : "MorpheApp/morphe-cli"
      setMorpheSourceRepoOptions((prev) => mergeRepoOptions(prev, nextRepo, "MorpheApp/morphe-cli"))
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
      const nextRepo = hasText(configForm.patches.patchesRepo) ? configForm.patches.patchesRepo : "MorpheApp/morphe-patches"
      setPatchesSourceRepoOptions((prev) => mergeRepoOptions(prev, nextRepo, "MorpheApp/morphe-patches"))
      setPatchesSourceRepo(nextRepo)
      loadPatchesLocalFiles()
    }
  }, [patchesSettingsOpen])

  useEffect(() => {
    if (patchesSettingsOpen) {
      loadPatchesSourceVersions()
    }
  }, [patchesSettingsOpen, patchesSourceRepo])

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
          <Select value={locale} onValueChange={(value) => setLocale(value === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE)}>
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
        <p className='text-xs text-muted-foreground break-words'>{message}</p>
      </aside>

      <main className='main-panel space-y-4'>
        {activeNav === NAV_BUILD && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Hammer className='h-5 w-5' />
                  {t("build.title")}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='space-y-2 rounded-md bg-background p-3'>
                  {isBuildRunning || buildLaunchPending || isBuildStopping ? (
                    <div className='flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm'>
                      <div className='min-w-0 flex items-center gap-2'>
                        <Loader2 className='h-5 w-5 animate-spin text-primary' />
                        <span className='font-medium text-primary'>{t("build.progress")}</span>
                        <span className='text-muted-foreground'>|</span>
                        <span className='text-muted-foreground break-all'>{liveLastLine || t("build.waiting")}</span>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='icon'
                          onClick={() => setLogDialogOpen(true)}
                          disabled={!liveTaskId}
                          aria-label={t("build.openCurrentLog")}
                          title={t("build.openCurrentLog")}>
                          <FileText className='h-5 w-5' />
                        </Button>
                        <Button
                          variant='outline'
                          onClick={onStopBuildTask}
                          disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
                          className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
                          <Square className='h-5 w-5' />
                          {isBuildStopping ? t("build.stopping") : t("build.stop")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {!isBuildRunning && !isBuildStopping && !buildLaunchPending ? (
                    <Button className='w-full' variant='default' onClick={onBuildPrimaryAction}>
                      <Play className='h-5 w-5' />
                      {t("build.start")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='space-y-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <CardTitle className='flex items-center gap-2'>
                      <Settings2 className='h-5 w-5' />
                      {t("settings.title")}
                    </CardTitle>
                    {/*  <CardDescription className='flex items-center gap-2 break-all'>
                      <FileText className='h-4 w-4' />
                      <span className='font-mono'>{configPath}</span>
                    </CardDescription> */}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button variant={rawOverrideMode ? "default" : "outline"} onClick={onToggleRawMode} disabled={isBusy}>
                      <Code2 className='h-5 w-5' />
                      {t("settings.raw")}
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => setConfigPathDialogOpen(true)}
                      disabled={isBusy}
                      aria-label={t("dialog.configPathTitle")}
                      title={t("dialog.configPathTitle")}>
                      <Pencil className='h-5 w-5' />
                      {t("settings.path")}
                    </Button>
                    <Button variant='outline' onClick={loadConfig} disabled={isBusy}>
                      <RefreshCw className='h-5 w-5' />
                      {t("settings.reload")}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className='space-y-4'>
                {rawOverrideMode ? (
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <Label htmlFor='raw-toml'>{t("settings.rawInput")}</Label>
                      <Button variant='outline' onClick={() => setRawConfigInput(generatedToml)} disabled={isBusy}>
                        {t("settings.applyForm")}
                      </Button>
                    </div>
                    <Textarea
                      id='raw-toml'
                      className='min-h-[340px] font-mono text-xs'
                      value={rawConfigInput}
                      onChange={(event) => setRawConfigInput(event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div className='space-y-4'>
                    <section className='space-y-2'>
                      <h3 className='text-base font-semibold'>{t("settings.source")}</h3>
                      <div className='flex flex-wrap gap-2'>
                        <Button variant='outline' className='h-11 px-5 text-base' onClick={() => setMorpheSettingsOpen(true)} disabled={isBusy}>
                          <Settings2 className='h-6 w-6' />
                          morphe-cli
                        </Button>
                        <Button variant='outline' className='h-11 px-5 text-base' onClick={() => setPatchesSettingsOpen(true)} disabled={isBusy}>
                          <Package className='h-6 w-6' />
                          patches
                        </Button>
                      </div>
                    </section>

                    <section className='space-y-3 pt-1'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <h3 className='text-base font-semibold'>{t("settings.apps")}</h3>
                        <Button variant='outline' className='h-11 px-5 text-base' onClick={appendApp} disabled={isBusy || appTemplateLoading}>
                          {appTemplateLoading ? <Loader2 className='h-6 w-6 animate-spin' /> : <Plus className='h-6 w-6' />}
                          {t("settings.loadTemplate")}
                        </Button>
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        {configForm.apps.map((app) => (
                          <Card key={app.id} className='border-0 shadow-none bg-transparent'>
                            <div
                              role='button'
                              tabIndex={0}
                              className='inline-flex min-h-20 items-center gap-5 rounded-md px-5 py-4 cursor-pointer bg-muted/35 hover:bg-accent/35'
                              onClick={() => updateApp(app.id, { mode: app.mode === "false" ? "remote" : "false" })}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault()
                                  updateApp(app.id, { mode: app.mode === "false" ? "remote" : "false" })
                                }
                              }}>
                              <span
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                                  app.mode !== "false" ? "bg-emerald-100 text-emerald-700" : "bg-muted/60 text-slate-400",
                                )}>
                                {app.mode !== "false" ? <Check className='h-6 w-6' /> : null}
                              </span>
                              <div className='flex items-center gap-2'>
                                {hasText(getPackageIcon(app.packageName)) ? (
                                  <img
                                    src={getPackageIcon(app.packageName)}
                                    alt={app.displayName || app.name || "app"}
                                    className='h-8 w-8 rounded-sm object-contain'
                                  />
                                ) : (
                                  <Smartphone className='h-8 w-8 text-muted-foreground' />
                                )}
                                <span className='text-lg font-medium whitespace-nowrap'>{app.displayName || app.name || "app-name"}</span>
                              </div>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-11 w-11'
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setAppSettingsId(app.id)
                                  setAppSettingsOpen(true)
                                }}>
                                <Pencil className='h-6 w-6' />
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeNav === NAV_HISTORY && (
          <div className='space-y-4'>
            <Card>
              <CardHeader>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <CardTitle>{t("history.title")}</CardTitle>
                    <CardDescription>{t("history.desc")}</CardDescription>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => openConfirmDialog("clear-all-cache", t("confirm.clearCacheTitle"), t("confirm.clearCacheDesc"))}
                      disabled={clearingAllCache}
                      className='border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800'>
                      {clearingAllCache ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      {t("history.clearCache")}
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => openConfirmDialog("delete-all-tasks", t("confirm.deleteAllTasksTitle"), t("confirm.deleteAllTasksDesc"))}
                      disabled={deletingAllTasks}
                      className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
                      {deletingAllTasks ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      {t("history.deleteAll")}
                    </Button>
                    <Button variant='outline' onClick={refreshTasks} disabled={isBusy}>
                      <RefreshCw className='h-4 w-4' />
                      {t("history.refresh")}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className='grid gap-2 max-h-[520px] overflow-auto'>
                  {tasks.map((task) => (
                    <div
                      role='button'
                      tabIndex={0}
                      key={task.id}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left transition hover:bg-accent",
                        selectedTaskId === task.id && "border-primary bg-primary/5",
                      )}
                      onClick={() => {
                        setSelectedTaskId(task.id)
                        setTaskDetailDialogOpen(true)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          setSelectedTaskId(task.id)
                          setTaskDetailDialogOpen(true)
                        }
                      }}>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='text-sm'>{formatTaskLabel(task)}</span>
                        <div className='flex items-center gap-2'>
                          <Badge variant={statusVariant(task.status)}>{task.status || "unknown"}</Badge>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={(event) => {
                              event.stopPropagation()
                              openConfirmDialog("delete-task", t("confirm.deleteTaskTitle"), t("confirm.deleteTaskDesc", { id: task.id }), task.id)
                            }}
                            disabled={deletingTaskId === task.id}
                            title={t("history.deleteTask")}
                            aria-label={t("history.deleteTask")}
                            className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                            {deletingTaskId === task.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle>{t("dialog.currentProgress")}</DialogTitle>
              <DialogDescription>{liveTaskId ? t("dialog.taskId", { id: liveTaskId }) : t("dialog.noLiveTask")}</DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <Badge variant={statusVariant(liveTaskStatus || "outline")}>{liveTaskStatus || "idle"}</Badge>
                {liveTaskStatus === "running" ? (
                  <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    {t("dialog.running")}
                  </span>
                ) : null}
              </div>

              <div className='rounded-md border bg-muted/30 p-3'>
                <p className='text-xs text-muted-foreground'>{t("dialog.latestProgress")}</p>
                <p className='mt-1 text-sm break-all'>{liveLastLine || t("build.waiting")}</p>
              </div>

              <pre className='mono-box max-h-[420px]'>{liveTaskLog || t("dialog.noLog")}</pre>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={historyLogDialogOpen} onOpenChange={setHistoryLogDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle>{t("dialog.taskLogTail")}</DialogTitle>
              <DialogDescription>{selectedTaskId ? t("dialog.taskId", { id: selectedTaskId }) : t("dialog.noTaskSelected")}</DialogDescription>
            </DialogHeader>
            <pre className='mono-box max-h-[420px]'>{taskLog || t("dialog.noLog")}</pre>
          </DialogContent>
        </Dialog>

        <Dialog open={taskDetailDialogOpen} onOpenChange={setTaskDetailDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle>{t("dialog.taskInfo")}</DialogTitle>
              <DialogDescription>{selectedTaskId ? t("dialog.taskId", { id: selectedTaskId }) : t("dialog.noTaskSelected")}</DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-xs text-muted-foreground break-all min-w-0'>
                  {taskOutputDir || selectedTask?.taskOutputDir || selectedTask?.taskLogPath || "-"}
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={() => setHistoryLogDialogOpen(true)}
                    disabled={!selectedTaskId}
                    title={t("dialog.viewTaskLog")}
                    aria-label={t("dialog.viewTaskLog")}>
                    <ScrollText className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={onOpenSelectedTaskOutputDir}
                    disabled={!selectedTaskId || openingTaskFolder}
                    title={t("dialog.openTaskOutput")}
                    aria-label={t("dialog.openTaskOutput")}>
                    {openingTaskFolder ? <Loader2 className='h-4 w-4 animate-spin' /> : <FolderOpen className='h-4 w-4' />}
                  </Button>
                </div>
              </div>

              <div className='space-y-2 max-h-[420px] overflow-auto pr-1'>
                {taskArtifacts.length > 0 ? (
                  taskArtifacts.map((item) => (
                    <div key={item.fullPath} className='flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2'>
                      <div className='min-w-0'>
                        <p className='text-sm font-medium break-all'>{item.fileName}</p>
                        <p className='text-xs text-muted-foreground break-all'>{item.relativePath}</p>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Badge variant='outline'>{formatBytes(item.sizeBytes)}</Badge>
                        <Button
                          variant='outline'
                          size='icon'
                          onClick={() => onOpenArtifactDir(item.relativePath)}
                          disabled={openingArtifactPath === item.relativePath}
                          title={t("dialog.openArtifactDir")}
                          aria-label={`${t("dialog.openArtifactDir")}: ${item.fileName}`}>
                          {openingArtifactPath === item.relativePath ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            <FolderOpen className='h-4 w-4' />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>{t("dialog.noArtifacts")}</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={configPathDialogOpen} onOpenChange={setConfigPathDialogOpen}>
          <DialogContent className='max-w-xl'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <FileText className='h-4 w-4' />
                {t("dialog.configPathTitle")}
              </DialogTitle>
              <DialogDescription>{t("dialog.configPathDesc")}</DialogDescription>
            </DialogHeader>
            <div className='space-y-1'>
              <Label htmlFor='config-path'>{t("dialog.configPathLabel")}</Label>
              <Input id='config-path' value={configPath} onChange={(event) => setConfigPath(event.target.value)} placeholder='config.toml' />
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
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
          }}>
          <DialogContent className='max-w-2xl'>
            <DialogHeader>
              <DialogTitle>{t("dialog.appSettings")}</DialogTitle>
              <DialogDescription>
                {editingApp
                  ? `${editingApp.displayName || editingApp.name || t("dialog.noAppSelected")} · ${editingApp.packageName || "-"}`
                  : t("dialog.noAppSelected")}
              </DialogDescription>
            </DialogHeader>

            {editingApp ? (
              <div className='space-y-3'>
                <div className='space-y-1'>
                  <Popover open={appDlurlPopoverOpen} onOpenChange={setAppDlurlPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type='button' variant='outline' className='w-full justify-start'>
                        <Link2 className='h-4 w-4' />
                        <span>{t("app.versionAndPatches")}</span>
                        <span className='mx-1 text-muted-foreground'>|</span>
                        {editingApp.mode === "local" ? (
                          <HardDrive className='h-4 w-4 text-amber-700' />
                        ) : (
                          <Cloud className='h-4 w-4 text-sky-700' />
                        )}
                        <span className='font-medium'>{editingApp.mode === "local" ? "local" : "remote"}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent side='bottom' align='start' className='w-[460px] max-w-[calc(100vw-3rem)] space-y-3'>
                      <div className='space-y-1'>
                        <Label htmlFor={`${editingApp.id}-mode`}>mode</Label>
                        <Select
                          value={editingApp.mode === "local" ? "local" : "remote"}
                          onValueChange={(value) => {
                            if (value === "local") {
                              const firstPath = appLocalApkFiles.length > 0 ? String(appLocalApkFiles[0].fullPath || "") : ""
                              updateApp(editingApp.id, {
                                mode: "local",
                                localApkSelectedPath: hasText(editingApp.localApkSelectedPath) ? editingApp.localApkSelectedPath : firstPath,
                              })
                              return
                            }
                            updateApp(editingApp.id, { mode: "remote" })
                          }}>
                          <SelectTrigger id={`${editingApp.id}-mode`}>
                            <span className='inline-flex items-center gap-2'>
                              {editingApp.mode === "local" ? <HardDrive className='h-4 w-4 text-amber-700' /> : <Cloud className='h-4 w-4 text-sky-700' />}
                              <span>{editingApp.mode === "local" ? "local" : "remote"}</span>
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='remote'>
                              <span className='inline-flex items-center gap-2'>
                                <Cloud className='h-4 w-4 text-sky-700' />
                                <span>remote</span>
                              </span>
                            </SelectItem>
                            <SelectItem value='local'>
                              <span className='inline-flex items-center gap-2'>
                                <HardDrive className='h-4 w-4 text-amber-700' />
                                <span>local</span>
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {editingApp.mode === "local" ? (
                        <>
                          <div className='space-y-1'>
                            <div className='flex items-center justify-between gap-2'>
                              <Label htmlFor={`${editingApp.id}-local-apk-select`}>{locale === "zh-TW" ? "本地 APK（已下載）" : "Local APK (downloaded)"}</Label>
                              <Button variant='ghost' size='icon' onClick={() => loadAppLocalApkFiles(editingApp)} disabled={appLocalApkLoading}>
                                {appLocalApkLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                              </Button>
                            </div>
                            <p className='text-[11px] text-muted-foreground break-all'>
                              {locale === "zh-TW" ? "掃描路徑" : "Scan dir"}: {appLocalApkDir || "-"} ({appLocalApkFiles.length})
                            </p>
                            <Select
                              value={hasText(editingApp.localApkSelectedPath) ? editingApp.localApkSelectedPath : (appLocalApkFiles[0]?.fullPath || "__NONE__")}
                              onValueChange={(value) => {
                                if (value === "__NONE__") return
                                updateApp(editingApp.id, { localApkSelectedPath: value })
                              }}>
                              <SelectTrigger id={`${editingApp.id}-local-apk-select`}>
                                <SelectValue placeholder={locale === "zh-TW" ? "請先下載 APK" : "Please download APK first"} />
                              </SelectTrigger>
                              <SelectContent>
                                {appLocalApkFiles.length === 0 ? (
                                  <SelectItem value='__NONE__' disabled>
                                    {locale === "zh-TW" ? "尚無可用 APK" : "No APK available"}
                                  </SelectItem>
                                ) : (
                                  appLocalApkFiles.map((file) => (
                                    <SelectItem key={`app-local-apk-${file.fullPath}`} value={String(file.fullPath)}>
                                      {String(file.name || file.fileName || file.relativePath || file.fullPath)}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className='space-y-1'>
                            <div className='flex items-center justify-between gap-2'>
                              <Label htmlFor={`${editingApp.id}-local-apk-custom`}>{locale === "zh-TW" ? "自訂檔案路徑（優先）" : "Custom file path (override)"}</Label>
                              <Button
                                type='button'
                                variant='outline'
                                size='icon'
                                onClick={() => onBrowseAppLocalApkPath(editingApp)}
                                title={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}
                                aria-label={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}>
                                <FolderOpen className='h-4 w-4' />
                              </Button>
                            </div>
                            <Input
                              id={`${editingApp.id}-local-apk-custom`}
                              value={editingApp.localApkCustomPath || ""}
                              onChange={(event) => updateApp(editingApp.id, { localApkCustomPath: event.target.value })}
                              placeholder={locale === "zh-TW" ? "留空則使用上方已下載 APK" : "Leave empty to use selected downloaded APK"}
                            />
                          </div>
                        </>
                      ) : null}

                      {editingApp.mode !== "local" ? (
                        <>
                          <div className='space-y-1'>
                            <Label htmlFor={`${editingApp.id}-apkmirror`}>apkmirror-dlurl</Label>
                            <Input
                              id={`${editingApp.id}-apkmirror`}
                              value={editingApp.apkmirrorDlurl}
                              onChange={(event) => updateApp(editingApp.id, { apkmirrorDlurl: event.target.value })}
                              placeholder='https://www.apkmirror.com/apk/google-inc/youtube'
                            />
                          </div>

                          <div className='space-y-1'>
                            <Label htmlFor={`${editingApp.id}-uptodown`}>uptodown-dlurl</Label>
                            <Input
                              id={`${editingApp.id}-uptodown`}
                              value={editingApp.uptodownDlurl}
                              onChange={(event) => updateApp(editingApp.id, { uptodownDlurl: event.target.value })}
                              placeholder='https://youtube.en.uptodown.com/android'
                            />
                          </div>

                          <div className='space-y-1'>
                            <Label htmlFor={`${editingApp.id}-archive`}>archive-dlurl</Label>
                            <Input
                              id={`${editingApp.id}-archive`}
                              value={editingApp.archiveDlurl}
                              onChange={(event) => updateApp(editingApp.id, { archiveDlurl: event.target.value })}
                              placeholder='https://archive.org/...'
                            />
                          </div>
                        </>
                      ) : null}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className='space-y-2 rounded-md border bg-muted/20 p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-xs text-muted-foreground break-all'>
                      {t("app.basedOnMpp", {
                        name: String(appPatchOptions[editingApp.id]?.patchFileName || appVersionOptions[editingApp.id]?.patchFileName || "").trim() || t("app.notLoaded"),
                      })}
                    </p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        loadAppVersions(editingApp)
                        loadAppPatchOptions(editingApp)
                      }}
                      disabled={appVersionLoadingId === editingApp.id || appPatchLoadingId === editingApp.id}
                      title={t("action.refresh")}
                      aria-label={t("action.refresh")}>
                      {appVersionLoadingId === editingApp.id || appPatchLoadingId === editingApp.id ? (
                        <Loader2 className='h-4 w-4 animate-spin' />
                      ) : (
                        <RefreshCw className='h-4 w-4' />
                      )}
                      {t("action.refresh")}
                    </Button>
                  </div>

                  <div className='grid gap-3 md:grid-cols-2'>
                    <div className='space-y-1'>
                      {(() => {
                        const versionMeta = appVersionOptions[editingApp.id] || {}
                        const configuredVer = String(editingApp.ver || "").trim()
                        const knownVersions = Array.isArray(versionMeta.versions) ? versionMeta.versions.map((value) => String(value)) : []
                        const showUnsupportedConfiguredVer =
                          versionMeta.loaded === true && configuredVer.length > 0 && !versionMeta.any && !knownVersions.includes(configuredVer)
                        return (
                          <Select
                            value={hasText(editingApp.ver) ? String(editingApp.ver) : APP_VER_AUTO_VALUE}
                            onValueChange={(value) => updateApp(editingApp.id, { ver: value === APP_VER_AUTO_VALUE ? "" : value })}>
                            <SelectTrigger id={`${editingApp.id}-ver`}>
                              <span className='inline-flex min-w-0 items-center gap-2'>
                                <Smartphone className='h-4 w-4 text-sky-700' />
                                <span>ver</span>
                                <span className='text-muted-foreground'>|</span>
                                <span className='truncate font-medium'>{hasText(editingApp.ver) ? String(editingApp.ver) : "auto"}</span>
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={APP_VER_AUTO_VALUE}>auto</SelectItem>
                              {showUnsupportedConfiguredVer ? (
                                <SelectItem value={configuredVer} disabled>
                                  {configuredVer} ({locale === "zh-TW" ? "不相容，執行時會 fallback auto" : "incompatible, will fallback to auto at runtime"})
                                </SelectItem>
                              ) : null}
                              {(appVersionOptions[editingApp.id]?.versions || []).map((ver) => (
                                <SelectItem key={`${editingApp.id}-${ver}`} value={String(ver)}>
                                  {String(ver)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                      })()}
                      <p className='text-xs text-muted-foreground break-all'>
                        {appVersionError
                          ? appVersionError
                          : appVersionOptions[editingApp.id]?.any
                            ? t("app.patchAnyHint")
                            : `${locale === "zh-TW" ? "可用版本" : "Available versions"}: ${(appVersionOptions[editingApp.id]?.versions || []).length}`}
                      </p>
                    </div>

                    <div className='space-y-1'>
                      <Select
                        value={editingApp.patchesMode === "custom" ? "custom" : "default"}
                        onValueChange={(value) => {
                          const defaultNames = (appPatchOptions[editingApp.id]?.entries || [])
                            .filter((entry) => entry && entry.enabled === true)
                            .map((entry) => String(entry.name || "").trim())
                            .filter(Boolean)
                          const existingNames = Array.isArray(editingApp.patches)
                            ? editingApp.patches.map((name) => String(name || "").trim()).filter(Boolean)
                            : []
                          const nextNames = existingNames.length > 0 ? existingNames : defaultNames
                          updateApp(editingApp.id, {
                            patchesMode: value === "custom" ? "custom" : "default",
                            patches: value === "custom" ? nextNames : [],
                          })
                        }}>
                        <SelectTrigger id={`${editingApp.id}-patches-mode`}>
                          <span className='inline-flex min-w-0 items-center gap-2'>
                            <Settings2 className='h-4 w-4 text-sky-700' />
                            <span>patches_mode</span>
                            <span className='text-muted-foreground'>|</span>
                            <span className='truncate font-medium'>{editingApp.patchesMode === "custom" ? "custom" : "default"}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='default'>default</SelectItem>
                          <SelectItem value='custom'>custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className='text-xs text-muted-foreground'>
                        {appPatchError ? appPatchError : `${locale === "zh-TW" ? "可用補丁" : "Available patches"}: ${(appPatchOptions[editingApp.id]?.entries || []).length}`}
                      </p>
                    </div>
                  </div>

                  {editingApp.patchesMode === "custom" ? (
                    <div className='space-y-1'>
                      <div className='flex items-center justify-between gap-2'>
                        <Label>custom patches</Label>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          onClick={() => loadAppPatchOptions(editingApp, { applyDefaultSelection: true })}
                          disabled={appPatchLoadingId === editingApp.id}>
                          {appPatchLoadingId === editingApp.id ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
                          {locale === "zh-TW" ? "使用預設" : "Use defaults"}
                        </Button>
                      </div>
                      <div className='max-h-[260px] space-y-2 overflow-auto rounded-md border bg-background p-2'>
                        {(appPatchOptions[editingApp.id]?.entries || []).length > 0 || (appUnsupportedPatches[editingApp.id] || []).length > 0 ? (
                          <>
                            {(appPatchOptions[editingApp.id]?.entries || []).map((entry) => {
                            const patchName = String(entry?.name || "").trim()
                            const patchDescription = String(entry?.description || "").trim()
                            const translatedPatch = getPatchTranslation(locale, patchName, patchDescription)
                            const selected =
                              Array.isArray(editingApp.patches) &&
                              editingApp.patches.map((value) => String(value || "").trim().toLowerCase()).includes(patchName.toLowerCase())
                            return (
                              <label
                                key={`${editingApp.id}-patch-${entry.index}`}
                                className='flex items-start gap-3 rounded-md bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60'>
                                <Checkbox checked={selected} onCheckedChange={(checked) => toggleAppPatch(editingApp.id, patchName, checked === true)} className='mt-0.5' />
                                <span className='min-w-0 flex-1'>
                                  <span className='flex items-center gap-2'>
                                    <span className='font-mono text-xs text-muted-foreground'>{entry.index}</span>
                                    <span className='break-words font-medium'>{translatedPatch.name}</span>
                                  </span>
                                  {hasText(translatedPatch.description) ? (
                                    <span className='mt-1 block whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground'>
                                      {translatedPatch.description}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            )
                            })}
                            {(appUnsupportedPatches[editingApp.id] || []).map((patchName) => {
                              const translatedPatch = getPatchTranslation(locale, patchName, "")
                              return (
                              <label
                                key={`${editingApp.id}-patch-unsupported-${patchName}`}
                                className='flex items-start gap-3 rounded-md bg-muted/25 px-3 py-2.5 text-sm opacity-75'>
                                <Checkbox checked={false} disabled className='mt-0.5' />
                                <span className='min-w-0 flex-1'>
                                  <span className='flex items-center gap-2'>
                                    <span className='font-mono text-xs text-muted-foreground'>-</span>
                                    <span className='break-words line-through text-muted-foreground'>{translatedPatch.name}</span>
                                    <Badge variant='outline' className='text-[10px]'>{t("app.unsupported")}</Badge>
                                  </span>
                                </span>
                              </label>
                              )
                            })}
                          </>
                        ) : (
                          <p className='text-xs text-muted-foreground'>{t("app.noPatchList")}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className='text-xs text-muted-foreground'>{t("app.defaultPatchHint")}</p>
                  )}
                </div>

              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={morpheSettingsOpen} onOpenChange={setMorpheSettingsOpen}>
          <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Settings2 className='h-4 w-4' />
                {t("morphe.settings")}
              </DialogTitle>
            </DialogHeader>
            <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
              <div className='space-y-2 rounded-md bg-muted/40 p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <div className='relative'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setMorpheSourcePopoverOpen((prev) => !prev)}
                        className='bg-sky-50 text-sky-800 hover:bg-sky-100'>
                        {t("source.downloadCli")}
                      </Button>
                      {morpheSourcePopoverOpen ? (
                        <div className='absolute left-0 top-full z-20 mt-2 w-[360px] max-w-[calc(100vw-4rem)] space-y-2 rounded-md bg-background/95 p-3 shadow-md'>
                          <div className='space-y-1'>
                            <Label htmlFor='morphe-source-repo'>{t("source.repo")}</Label>
                            <Select
                              value={hasText(configForm.morpheCli.patchesRepo) ? configForm.morpheCli.patchesRepo : "MorpheApp/morphe-cli"}
                              onValueChange={(value) => {
                                setMorpheSourceRepoOptions((prev) => mergeRepoOptions(prev, value, "MorpheApp/morphe-cli"))
                                updateConfigSection("morpheCli", { patchesRepo: value })
                                setMorpheSourceRepo(value)
                              }}>
                              <SelectTrigger id='morphe-source-repo'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {morpheSourceRepoOptions.map((repo) => (
                                  <SelectItem key={`morphe-source-repo-${repo}`} value={repo}>
                                    {repo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className='flex items-center gap-2'>
                              <Input
                                value={morpheSourceRepoDraft}
                                onChange={(event) => setMorpheSourceRepoDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return
                                  event.preventDefault()
                                  onAddMorpheSourceRepo()
                                }}
                                placeholder='owner/repo'
                              />
                              <Button type='button' variant='outline' size='sm' onClick={onAddMorpheSourceRepo} disabled={!hasText(morpheSourceRepoDraft)}>
                                <Plus className='h-4 w-4' />
                                {t("action.add")}
                              </Button>
                            </div>
                          </div>
                          <div className='space-y-1'>
                            <Label htmlFor='morphe-source-version'>{t("source.version")}</Label>
                            <Select
                              value={morpheSourceVersion || "__NONE__"}
                              onValueChange={(value) => setMorpheSourceVersion(value === "__NONE__" ? "" : value)}>
                              <SelectTrigger id='morphe-source-version'>
                                <SelectValue placeholder={t("source.selectVersion")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                                {morpheSourceVersions.map((item) => (
                                  <SelectItem key={`morphe-src-ver-${item.fileName}`} value={String(item.fileName)}>
                                    {item.fileName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            className='w-full'
                            onClick={onDownloadMorpheFromSource}
                            disabled={morpheSourceDownloading || !hasText(morpheSourceVersion) || morpheSourceLoading}>
                            {morpheSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Play className='h-4 w-4' />}
                            {t("source.download")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <RadioGroup
                  value={
                    configForm.morpheCli.mode === "dev"
                      ? MORPHE_REMOTE_DEV_VALUE
                      : configForm.morpheCli.mode === "stable"
                        ? MORPHE_REMOTE_STABLE_VALUE
                        : configForm.morpheCli.path || "__NONE__"
                  }
                  onValueChange={(value) => {
                    if (value === MORPHE_REMOTE_STABLE_VALUE) {
                      updateConfigSection("morpheCli", { mode: "stable" })
                      return
                    }
                    if (value === MORPHE_REMOTE_DEV_VALUE) {
                      updateConfigSection("morpheCli", { mode: "dev" })
                      return
                    }
                    updateConfigSection("morpheCli", {
                      mode: "local",
                      path: value === "__NONE__" ? "" : value,
                    })
                  }}
                  className='grid gap-2 space-y-1 max-h-[440px] overflow-auto'>
                  <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("morpheCli", { mode: "stable" })}>
                      <RadioGroupItem value={MORPHE_REMOTE_STABLE_VALUE} className='mt-0.5' />
                      <Cloud className='mt-0.5 h-4 w-4 text-sky-700' />
                      <span className='min-w-0'>
                        <span className='block text-xs font-medium break-all'>stable morphe-cli</span>
                        <span className='block text-[11px] text-muted-foreground break-all'>{hasText(configForm.morpheCli.patchesRepo) ? configForm.morpheCli.patchesRepo : "MorpheApp/morphe-cli"}</span>
                      </span>
                    </label>
                  </div>
                  <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("morpheCli", { mode: "dev" })}>
                      <RadioGroupItem value={MORPHE_REMOTE_DEV_VALUE} className='mt-0.5' />
                      <FlaskConical className='mt-0.5 h-4 w-4 text-amber-700' />
                      <span className='min-w-0'>
                        <span className='block text-xs font-medium break-all'>dev morphe-cli</span>
                        <span className='block text-[11px] text-muted-foreground break-all'>{hasText(configForm.morpheCli.patchesRepo) ? configForm.morpheCli.patchesRepo : "MorpheApp/morphe-cli"}</span>
                      </span>
                    </label>
                  </div>
                  {morpheLocalFiles.length > 0 ? (
                    morpheLocalFiles.map((file) => (
                      <div
                        key={`morphe-row-${file.fullPath}`}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors",
                          configForm.morpheCli.path === file.fullPath ? "bg-sky-100/90 text-sky-950" : "bg-background/80 hover:bg-muted/70",
                        )}>
                        <label
                          className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer'
                          onClick={() => updateConfigSection("morpheCli", { path: file.fullPath })}>
                          <RadioGroupItem value={file.fullPath} className='mt-0.5' />
                          <HardDrive className='mt-0.5 h-4 w-4 text-muted-foreground' />
                          <span className='min-w-0' title={file.relativePath}>
                            <span className='block text-sm font-medium break-all'>
                              {file.name}{" "}
                              <span className='text-xs text-muted-foreground'>({formatBytes(file.sizeBytes)})</span>
                            </span>
                            <span className='block text-[11px] text-muted-foreground break-all'>{file.relativePath}</span>
                          </span>
                        </label>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={(event) => {
                            event.stopPropagation()
                            openConfirmDialog("delete-morphe-file", t("confirm.deleteMorpheTitle"), t("confirm.deleteMorpheDesc", { path: file.relativePath }), file)
                          }}
                          disabled={morpheDeleteName === file.relativePath}
                          className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                          {morpheDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className='text-xs text-muted-foreground'>{t("morphe.noLocalFiles")}</p>
                  )}
                </RadioGroup>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={patchesSettingsOpen} onOpenChange={setPatchesSettingsOpen}>
          <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Package className='h-4 w-4' />
                {t("patches.settings")}
              </DialogTitle>
            </DialogHeader>
            <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
              <div className='space-y-2 rounded-md bg-muted/40 p-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <div className='relative'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setPatchesSourcePopoverOpen((prev) => !prev)}
                        className='bg-sky-50 text-sky-800 hover:bg-sky-100'>
                        {t("source.downloadPatches")}
                      </Button>
                      {patchesSourcePopoverOpen ? (
                        <div className='absolute left-0 top-full z-20 mt-2 w-[360px] max-w-[calc(100vw-4rem)] space-y-2 rounded-md bg-background/95 p-3 shadow-md'>
                          <div className='space-y-1'>
                            <Label htmlFor='patches-source-repo'>{t("source.repo")}</Label>
                            <Select
                              value={hasText(configForm.patches.patchesRepo) ? configForm.patches.patchesRepo : "MorpheApp/morphe-patches"}
                              onValueChange={(value) => {
                                setPatchesSourceRepoOptions((prev) => mergeRepoOptions(prev, value, "MorpheApp/morphe-patches"))
                                updateConfigSection("patches", { patchesRepo: value })
                                setPatchesSourceRepo(value)
                              }}>
                              <SelectTrigger id='patches-source-repo'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {patchesSourceRepoOptions.map((repo) => (
                                  <SelectItem key={`patches-source-repo-${repo}`} value={repo}>
                                    {repo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className='flex items-center gap-2'>
                              <Input
                                value={patchesSourceRepoDraft}
                                onChange={(event) => setPatchesSourceRepoDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return
                                  event.preventDefault()
                                  onAddPatchesSourceRepo()
                                }}
                                placeholder='owner/repo'
                              />
                              <Button type='button' variant='outline' size='sm' onClick={onAddPatchesSourceRepo} disabled={!hasText(patchesSourceRepoDraft)}>
                                <Plus className='h-4 w-4' />
                                {t("action.add")}
                              </Button>
                            </div>
                          </div>
                          <div className='space-y-1'>
                            <Label htmlFor='patches-source-version'>{t("source.version")}</Label>
                            <Select
                              value={patchesSourceVersion || "__NONE__"}
                              onValueChange={(value) => setPatchesSourceVersion(value === "__NONE__" ? "" : value)}>
                              <SelectTrigger id='patches-source-version'>
                                <SelectValue placeholder={t("source.selectVersion")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                                {patchesSourceVersions.map((item) => (
                                  <SelectItem key={`patches-src-ver-${item.fileName}`} value={String(item.fileName)}>
                                    {item.fileName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            className='w-full'
                            onClick={onDownloadPatchesFromSource}
                            disabled={patchesSourceDownloading || !hasText(patchesSourceVersion) || patchesSourceLoading}>
                            {patchesSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Play className='h-4 w-4' />}
                            {t("source.download")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <RadioGroup
                  value={
                    configForm.patches.mode === "dev"
                      ? PATCHES_REMOTE_DEV_VALUE
                      : configForm.patches.mode === "stable"
                        ? PATCHES_REMOTE_STABLE_VALUE
                        : configForm.patches.path || "__NONE__"
                  }
                  onValueChange={(value) => {
                    if (value === PATCHES_REMOTE_STABLE_VALUE) {
                      updateConfigSection("patches", { mode: "stable" })
                      return
                    }
                    if (value === PATCHES_REMOTE_DEV_VALUE) {
                      updateConfigSection("patches", { mode: "dev" })
                      return
                    }
                    updateConfigSection("patches", {
                      mode: "local",
                      path: value === "__NONE__" ? "" : value,
                    })
                  }}
                  className='grid gap-2 space-y-1 max-h-[440px] overflow-auto'>
                  <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patches", { mode: "stable" })}>
                      <RadioGroupItem value={PATCHES_REMOTE_STABLE_VALUE} className='mt-0.5' />
                      <Cloud className='mt-0.5 h-4 w-4 text-sky-700' />
                      <span className='min-w-0'>
                        <span className='block text-xs font-medium break-all'>stable patches</span>
                        <span className='block text-[11px] text-muted-foreground break-all'>{hasText(configForm.patches.patchesRepo) ? configForm.patches.patchesRepo : "MorpheApp/morphe-patches"}</span>
                      </span>
                    </label>
                  </div>
                  <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patches", { mode: "dev" })}>
                      <RadioGroupItem value={PATCHES_REMOTE_DEV_VALUE} className='mt-0.5' />
                      <FlaskConical className='mt-0.5 h-4 w-4 text-amber-700' />
                      <span className='min-w-0'>
                        <span className='block text-xs font-medium break-all'>dev patches</span>
                        <span className='block text-[11px] text-muted-foreground break-all'>{hasText(configForm.patches.patchesRepo) ? configForm.patches.patchesRepo : "MorpheApp/morphe-patches"}</span>
                      </span>
                    </label>
                  </div>
                  {patchesLocalFiles.length > 0 ? (
                    patchesLocalFiles.map((file) => (
                      <div
                        key={`patches-row-${file.fullPath}`}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors",
                          configForm.patches.path === file.fullPath ? "bg-sky-100/90 text-sky-950" : "bg-background/80 hover:bg-muted/70",
                        )}>
                        <label
                          className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer'
                          onClick={() => updateConfigSection("patches", { path: file.fullPath })}>
                          <RadioGroupItem value={file.fullPath} className='mt-0.5' />
                          <HardDrive className='mt-0.5 h-4 w-4 text-muted-foreground' />
                          <span className='min-w-0' title={file.relativePath}>
                            <span className='block text-sm font-medium break-all'>
                              {file.name}{" "}
                              <span className='text-xs text-muted-foreground'>({formatBytes(file.sizeBytes)})</span>
                            </span>
                            <span className='block text-[11px] text-muted-foreground break-all'>{file.relativePath}</span>
                          </span>
                        </label>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={(event) => {
                            event.stopPropagation()
                            openConfirmDialog("delete-patches-file", t("confirm.deletePatchesTitle"), t("confirm.deletePatchesDesc", { path: file.relativePath }), file)
                          }}
                          disabled={patchesDeleteName === file.relativePath}
                          className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                          {patchesDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className='text-xs text-muted-foreground'>{t("patches.noLocalFiles")}</p>
                  )}
                </RadioGroup>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmDialog.open} onOpenChange={(open) => (!open ? closeConfirmDialog() : null)}>
          <DialogContent className='max-w-md'>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title || t("confirm.title")}</DialogTitle>
              <DialogDescription>{confirmDialog.description || t("confirm.desc")}</DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' onClick={closeConfirmDialog} disabled={confirmDialogBusy}>
                {t("action.cancel")}
              </Button>
              <Button variant='destructive' onClick={onConfirmDialogAction} disabled={confirmDialogBusy}>
                {confirmDialogBusy ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                {t("action.confirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

export default App
