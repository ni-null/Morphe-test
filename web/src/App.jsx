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
  Hammer,
  HardDrive,
  Loader2,
  Package,
  ScrollText,
  Play,
  Plus,
  Pencil,
  RefreshCw,
  Settings2,
  Square,
  Smartphone,
  Trash2,
} from "lucide-react"
import {
  clearAllCache,
  deleteAllSourceFiles,
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
  fetchManualOptions,
  listTasks,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog"
import { cn } from "./lib/utils"

const NAV_BUILD = "build"
const NAV_HISTORY = "history"

const TASK_MODE_BUILD = "build"
const TASK_MODE_DOWNLOAD = "download"
const TASK_MODE_PATCHES = "patches"
const TASK_MODE_CLI = "cli"

const RESERVED_SECTIONS = new Set(["global", "morphe-cli", "morphe_cli", "patches"])

const DEFAULT_FLAGS = {
  dryRun: true,
  force: false,
}

const LIVE_BUILD_TASK_ID_KEY = "morphe.liveBuildTaskId"
const MANUAL_AUTO_VERSION_VALUE = "__AUTO__"
const APP_VER_AUTO_VALUE = "__APP_AUTO__"
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

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function formatTomlValue(value) {
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
  const manual = safeFlags && safeFlags.manual && safeFlags.manualPlan
  return {
    configPath,
    dryRun: !!safeFlags.dryRun,
    force: !!safeFlags.force,
    downloadOnly: mode === TASK_MODE_DOWNLOAD,
    patchesOnly: mode === TASK_MODE_PATCHES,
    morpheCliOnly: mode === TASK_MODE_CLI,
    manual: !!manual,
    manualPlan: manual || null,
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

function createManualPlanFromOptions(optionsData) {
  const apps = {}
  const list = Array.isArray(optionsData?.apps) ? optionsData.apps : []
  for (const app of list) {
    const name = String(app?.appName || "").trim()
    if (!name) continue
    const defaultIndices = Array.isArray(app?.defaultPatchIndices)
      ? app.defaultPatchIndices.map((value) => Number(value)).filter((value) => Number.isInteger(value))
      : []
    apps[name] = {
      version: String(app?.defaultVersion || "").trim(),
      patchIndices: Array.from(new Set(defaultIndices)),
    }
  }
  return { apps }
}

function App() {
  const [activeNav, setActiveNav] = useState(NAV_BUILD)

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
  const [buildManualEnabled, setBuildManualEnabled] = useState(false)
  const [buildManualLoading, setBuildManualLoading] = useState(false)
  const [buildManualOptions, setBuildManualOptions] = useState({ apps: [] })
  const [buildManualPlan, setBuildManualPlan] = useState({ apps: {} })
  const [manualActiveTab, setManualActiveTab] = useState("")
  const [manualSettingsDialogOpen, setManualSettingsDialogOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [appSettingsId, setAppSettingsId] = useState("")
  const [morpheSettingsOpen, setMorpheSettingsOpen] = useState(false)
  const [patchesSettingsOpen, setPatchesSettingsOpen] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [isAutoSavingConfig, setIsAutoSavingConfig] = useState(false)
  const [morpheProbeLoading, setMorpheProbeLoading] = useState(false)
  const [morpheProbeResult, setMorpheProbeResult] = useState("")
  const [patchesProbeLoading, setPatchesProbeLoading] = useState(false)
  const [patchesProbeResult, setPatchesProbeResult] = useState("")
  const [morpheLocalFiles, setMorpheLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [patchesLocalDir, setPatchesLocalDir] = useState("")
  const [morpheFilesLoading, setMorpheFilesLoading] = useState(false)
  const [patchesFilesLoading, setPatchesFilesLoading] = useState(false)
  const [morpheDeleteAllLoading, setMorpheDeleteAllLoading] = useState(false)
  const [patchesDeleteAllLoading, setPatchesDeleteAllLoading] = useState(false)
  const [morpheDeleteName, setMorpheDeleteName] = useState("")
  const [patchesDeleteName, setPatchesDeleteName] = useState("")
  const [morpheSourceRepo, setMorpheSourceRepo] = useState("MorpheApp/morphe-cli")
  const [morpheSourceVersions, setMorpheSourceVersions] = useState([])
  const [morpheSourceVersion, setMorpheSourceVersion] = useState("")
  const [morpheSourceLoading, setMorpheSourceLoading] = useState(false)
  const [morpheSourceDownloading, setMorpheSourceDownloading] = useState(false)
  const [morpheSourcePopoverOpen, setMorpheSourcePopoverOpen] = useState(false)
  const [appTemplateLoading, setAppTemplateLoading] = useState(false)
  const [appVersionOptions, setAppVersionOptions] = useState({})
  const [appVersionLoadingId, setAppVersionLoadingId] = useState("")
  const [appVersionError, setAppVersionError] = useState("")
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

  async function appendApp() {
    setAppTemplateLoading(true)
    try {
      const data = await fetchAppTemplates(configPath)
      const templates = Array.isArray(data?.templates) ? data.templates : []
      if (templates.length === 0) {
        setMessage("未查到可用模板。")
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
        setMessage(`載入模板完成，新增 ${addedCount} 個，重命名 ${renamedCount} 個。`)
      } else {
        setMessage("模板已全部載入。")
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
      setAppVersionError("缺少 package_name，無法查詢可用版本。")
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
          any: !!data?.any,
          versions,
          packageName: String(data?.packageName || packageName),
        },
      }))
      if (!data?.any && versions.length === 0) {
        setAppVersionError("未查到可用版本，將保持 auto。")
      }
    } catch (error) {
      setAppVersionError(error.message || String(error))
    } finally {
      setAppVersionLoadingId("")
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
    if (activeBuild) {
      setLiveTaskId(activeBuild.id)
      setLiveTask(activeBuild)
      if (!selectedTaskId) {
        setSelectedTaskId(activeBuild.id)
      }
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
      setMessage(`Raw 已載入最新設定: ${resolvedPath}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function onProbeMorpheCli() {
    if (configForm.morpheCli.mode === "local") return
    setMorpheProbeLoading(true)
    setMorpheProbeResult("")
    try {
      const data = await fetchAndSaveSource({
        type: "morphe-cli",
        mode: configForm.morpheCli.mode,
        patchesRepo: configForm.morpheCli.patchesRepo,
      })
      if (data?.reusedLocal) {
        setMorpheProbeResult(`受 GitHub 限流影響，改用本地檔案 ${data.fileName}`)
      } else {
        setMorpheProbeResult(`抓取並保存成功 ${data.fileName}`)
      }
      await loadMorpheLocalFiles()
    } catch (error) {
      setMorpheProbeResult(error.message || String(error))
    } finally {
      setMorpheProbeLoading(false)
    }
  }

  async function onProbePatches() {
    if (configForm.patches.mode === "local") return
    setPatchesProbeLoading(true)
    setPatchesProbeResult("")
    try {
      const data = await fetchAndSaveSource({
        type: "patches",
        mode: configForm.patches.mode,
        patchesRepo: configForm.patches.patchesRepo,
      })
      if (data?.reusedLocal) {
        setPatchesProbeResult(`受 GitHub 限流影響，改用本地檔案 ${data.fileName}`)
      } else {
        setPatchesProbeResult(`抓取並保存成功 ${data.fileName}`)
      }
      await loadPatchesLocalFiles()
    } catch (error) {
      setPatchesProbeResult(error.message || String(error))
    } finally {
      setPatchesProbeLoading(false)
    }
  }

  async function loadMorpheLocalFiles() {
    setMorpheFilesLoading(true)
    try {
      const data = await listSourceFiles("morphe-cli")
      setMorpheLocalFiles(Array.isArray(data?.files) ? data.files : [])
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheFilesLoading(false)
    }
  }

  async function loadMorpheSourceVersions() {
    setMorpheSourceLoading(true)
    try {
      const data = await fetchSourceVersions({
        type: "morphe-cli",
        repo: morpheSourceRepo,
      })
      const versions = Array.isArray(data?.versions) ? data.versions : []
      setMorpheSourceVersions(versions)
      setMorpheSourceVersion(versions.length > 0 ? String(versions[0].fileName || "") : "")
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheSourceLoading(false)
    }
  }

  async function loadPatchesLocalFiles() {
    setPatchesFilesLoading(true)
    try {
      const data = await listSourceFiles("patches")
      setPatchesLocalFiles(Array.isArray(data?.files) ? data.files : [])
      setPatchesLocalDir(String(data?.dir || ""))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setPatchesFilesLoading(false)
    }
  }

  function openConfirmDialog(action, title, description, payload = null) {
    setConfirmDialog({
      open: true,
      action: String(action || ""),
      title: String(title || "確認操作"),
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
      setMessage(`已刪除 ${relativePath}`)
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
      setMessage(`已刪除 ${relativePath}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setPatchesDeleteName("")
    }
  }

  async function onDeleteAllMorpheFiles() {
    setMorpheDeleteAllLoading(true)
    try {
      await deleteAllSourceFiles("morphe-cli")
      updateConfigSection("morpheCli", { path: "" })
      await loadMorpheLocalFiles()
      setMessage("已刪除全部 morphe-cli 檔案")
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setMorpheDeleteAllLoading(false)
    }
  }

  async function onDeleteAllPatchesFiles() {
    setPatchesDeleteAllLoading(true)
    try {
      await deleteAllSourceFiles("patches")
      updateConfigSection("patches", { path: "" })
      await loadPatchesLocalFiles()
      setMessage("已刪除全部 patches 檔案")
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setPatchesDeleteAllLoading(false)
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
      setMorpheProbeResult(`下載並保存成功 ${data.fileName}`)
      setMorpheSourcePopoverOpen(false)
    } catch (error) {
      setMorpheProbeResult(error.message || String(error))
    } finally {
      setMorpheSourceDownloading(false)
    }
  }

  async function onLoadManualOptions() {
    setBuildManualLoading(true)
    try {
      const data = await fetchManualOptions(configPath)
      const plan = createManualPlanFromOptions(data)
      setBuildManualOptions({ apps: Array.isArray(data?.apps) ? data.apps : [] })
      setBuildManualPlan(plan)
      setMessage("手動模式選項已載入")
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setBuildManualLoading(false)
    }
  }

  async function onBuildPrimaryAction() {
    if (isBuildRunning || isBuildStopping || buildLaunchPending) {
      await onStopBuildTask()
      return
    }
    if (buildManualEnabled) {
      setManualSettingsDialogOpen(true)
      if (!buildManualOptions.apps || buildManualOptions.apps.length === 0) {
        await onLoadManualOptions()
      }
      return
    }
    await runTask(TASK_MODE_BUILD, {
      dryRun: false,
      force: false,
      manual: null,
    })
  }

  async function onConfirmManualBuild() {
    await runTask(TASK_MODE_BUILD, {
      dryRun: false,
      force: false,
      manual: buildManualPlan,
    })
    setManualSettingsDialogOpen(false)
  }

  function updateManualVersion(appName, version) {
    setBuildManualPlan((prev) => ({
      apps: {
        ...(prev?.apps || {}),
        [appName]: {
          ...((prev?.apps && prev.apps[appName]) || {}),
          version: String(version || ""),
        },
      },
    }))
  }

  function updateManualPatchChecked(appName, patchIndex, checked) {
    setBuildManualPlan((prev) => {
      const current = (prev?.apps && prev.apps[appName]) || {}
      const currentList = Array.isArray(current.patchIndices) ? current.patchIndices : []
      const nextSet = new Set(currentList.map((value) => Number(value)).filter((value) => Number.isInteger(value)))
      if (checked) {
        nextSet.add(Number(patchIndex))
      } else {
        nextSet.delete(Number(patchIndex))
      }
      return {
        apps: {
          ...(prev?.apps || {}),
          [appName]: {
            ...current,
            patchIndices: Array.from(nextSet).sort((a, b) => a - b),
          },
        },
      }
    })
  }

  async function runTask(mode, flags = DEFAULT_FLAGS) {
    const isBuildRunningNow = String(liveTask?.status || "").toLowerCase() === "running"
    if (mode === TASK_MODE_BUILD && (isBuildRunningNow || buildLaunchPending)) {
      setMessage("完整打包進行中，請勿重複觸發。")
      return
    }
    if (mode === TASK_MODE_BUILD && flags && flags.manual) {
      const apps = flags.manual.apps && typeof flags.manual.apps === "object" ? Object.keys(flags.manual.apps) : []
      if (apps.length === 0) {
        setMessage("手動模式尚未載入可用選項。")
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
      setMessage("Task started")
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
      setMessage("Stop requested")
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
        setMessage(`設定已自動保存: ${resolvedPath}`)
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
        const [taskData, logData, artifactsData] = await Promise.all([
          fetchTask(selectedTaskId),
          fetchTaskLog(selectedTaskId, 500),
          fetchTaskArtifacts(selectedTaskId),
        ])
        if (canceled) return
        setSelectedTask(taskData.task || null)
        setTaskLog(String(logData?.content || ""))
        setTaskArtifacts(Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts : [])
        setTaskOutputDir(String(artifactsData?.outputDir || ""))
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
      setMessage(`Opened: ${data.path || taskOutputDir || selectedTaskId}`)
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
      setMessage(`Opened: ${data.path || relativePath}`)
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
      setMessage(`已刪除任務: ${taskId}`)
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
      setMessage("已刪除所有任務")
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
      setMessage(`快取已清除: ${data.path || "-"}`)
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
        const [taskData, logData] = await Promise.all([fetchTask(liveTaskId), fetchTaskLog(liveTaskId, 500)])
        if (canceled) return
        setLiveTask(taskData.task || null)
        setLiveTaskLog(String(logData?.content || ""))
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
      } else if (action === "delete-all-morphe-files") {
        await onDeleteAllMorpheFiles()
      } else if (action === "delete-all-patches-files") {
        await onDeleteAllPatchesFiles()
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
    setMorpheProbeResult("")
  }, [configForm.morpheCli.mode, configForm.morpheCli.patchesRepo, configForm.morpheCli.path])

  useEffect(() => {
    setPatchesProbeResult("")
  }, [configForm.patches.mode, configForm.patches.patchesRepo, configForm.patches.path])

  useEffect(() => {
    if (morpheSettingsOpen) {
      loadMorpheLocalFiles()
      if (configForm.morpheCli.mode === "local") {
        loadMorpheSourceVersions()
      }
    }
  }, [morpheSettingsOpen])

  useEffect(() => {
    if (morpheSettingsOpen && configForm.morpheCli.mode === "local") {
      loadMorpheSourceVersions()
    }
  }, [morpheSettingsOpen, configForm.morpheCli.mode, morpheSourceRepo])

  useEffect(() => {
    if (patchesSettingsOpen) {
      loadPatchesLocalFiles()
    }
  }, [patchesSettingsOpen])

  const editingApp = useMemo(() => configForm.apps.find((app) => app.id === appSettingsId) || null, [configForm.apps, appSettingsId])

  useEffect(() => {
    if (!appSettingsOpen || !editingApp) return
    const existing = appVersionOptions[editingApp.id]
    if (existing) return
    loadAppVersions(editingApp)
  }, [appSettingsOpen, editingApp, appVersionOptions])

  useEffect(() => {
    const apps = Array.isArray(buildManualOptions?.apps) ? buildManualOptions.apps : []
    if (apps.length === 0) {
      setManualActiveTab("")
      return
    }
    const exists = apps.some((app) => String(app?.appName || "") === manualActiveTab)
    if (!exists) {
      setManualActiveTab(String(apps[0]?.appName || ""))
    }
  }, [buildManualOptions, manualActiveTab])

  const navItems = [
    { key: NAV_BUILD, label: "1. 打包", icon: Hammer },
    { key: NAV_HISTORY, label: "2. 歷史任務", icon: Archive },
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
          <p className='text-sm text-muted-foreground'>shadcn UI / Web 附加工具</p>
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
        <p className='text-xs text-muted-foreground break-words'>{message}</p>
      </aside>

      <main className='main-panel space-y-4'>
        {activeNav === NAV_BUILD && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Hammer className='h-5 w-5' />
                  打包執行
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='rounded-md   bg-background p-3 space-y-3'>
                  <RadioGroup
                    value={buildManualEnabled ? "manual" : "auto"}
                    onValueChange={(value) => setBuildManualEnabled(value === "manual")}
                    className='grid gap-2 md:grid-cols-2'>
                    <Label htmlFor='build-mode-auto' className='flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2'>
                      <RadioGroupItem id='build-mode-auto' value='auto' className='mt-1' />
                      <span>
                        <span className='block text-sm font-medium'>配置模式</span>
                        <span className='block text-xs text-muted-foreground'>依目前配置檔規則自動挑選版本與補丁</span>
                      </span>
                    </Label>
                    <Label htmlFor='build-mode-manual' className='flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2'>
                      <RadioGroupItem id='build-mode-manual' value='manual' className='mt-1' />
                      <span>
                        <span className='block text-sm font-medium'>手動模式</span>
                        <span className='block text-xs text-muted-foreground'>可自訂每個 App 的版本與補丁內容</span>
                      </span>
                    </Label>
                  </RadioGroup>
                </div>
                <div className='space-y-2 rounded-md bg-background p-3'>
                  {isBuildRunning || buildLaunchPending || isBuildStopping ? (
                    <div className='flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm'>
                      <div className='min-w-0 flex items-center gap-2'>
                        <Loader2 className='h-5 w-5 animate-spin text-primary' />
                        <span className='font-medium text-primary'>打包進度資訊</span>
                        <span className='text-muted-foreground'>|</span>
                        <span className='text-muted-foreground break-all'>{liveLastLine || "等待任務輸出..."}</span>
                      </div>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='icon'
                          onClick={() => setLogDialogOpen(true)}
                          disabled={!liveTaskId}
                          aria-label='打開當前打包 Log'
                          title='打開當前打包 Log'>
                          <FileText className='h-5 w-5' />
                        </Button>
                        <Button
                          variant='outline'
                          onClick={onStopBuildTask}
                          disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
                          className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
                          <Square className='h-5 w-5' />
                          {isBuildStopping ? "中止中..." : "中止"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {!isBuildRunning && !isBuildStopping && !buildLaunchPending ? (
                    <Button className='w-full' variant='default' onClick={onBuildPrimaryAction}>
                      <Play className='h-5 w-5' />
                      開始完整打包
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
                      打包設定（config.toml）
                    </CardTitle>
                    {/*  <CardDescription className='flex items-center gap-2 break-all'>
                      <FileText className='h-4 w-4' />
                      <span className='font-mono'>{configPath}</span>
                    </CardDescription> */}
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button variant={rawOverrideMode ? "default" : "outline"} onClick={onToggleRawMode} disabled={isBusy}>
                      <Code2 className='h-5 w-5' />
                      Raw
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => setConfigPathDialogOpen(true)}
                      disabled={isBusy}
                      aria-label='修改讀取設定檔路徑'
                      title='修改讀取設定檔路徑'>
                      <Pencil className='h-5 w-5' />
                      路徑
                    </Button>
                    <Button variant='outline' onClick={loadConfig} disabled={isBusy}>
                      <RefreshCw className='h-5 w-5' />
                      重新載入
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className='space-y-4'>
                {rawOverrideMode ? (
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <Label htmlFor='raw-toml'>原始配置輸入（直接覆蓋）</Label>
                      <Button variant='outline' onClick={() => setRawConfigInput(generatedToml)} disabled={isBusy}>
                        套用表單內容
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
                      <h3 className='text-base font-semibold'>來源設定</h3>
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
                        <h3 className='text-base font-semibold'>App 區塊</h3>
                        <Button variant='outline' className='h-11 px-5 text-base' onClick={appendApp} disabled={isBusy || appTemplateLoading}>
                          {appTemplateLoading ? <Loader2 className='h-6 w-6 animate-spin' /> : <Plus className='h-6 w-6' />}
                          載入模板
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
                    <CardTitle>歷史任務</CardTitle>
                    <CardDescription>可查看每次任務狀態與輸出 log</CardDescription>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => openConfirmDialog("clear-all-cache", "清除全部快取", "確定要清除全部快取嗎？")}
                      disabled={clearingAllCache}
                      className='border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800'>
                      {clearingAllCache ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      清除全部快取
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => openConfirmDialog("delete-all-tasks", "刪除所有任務", "確定要刪除所有任務與其檔案嗎？")}
                      disabled={deletingAllTasks}
                      className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
                      {deletingAllTasks ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      刪除所有任務
                    </Button>
                    <Button variant='outline' onClick={refreshTasks} disabled={isBusy}>
                      <RefreshCw className='h-4 w-4' />
                      更新列表
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
                              openConfirmDialog("delete-task", "刪除任務", `確定要刪除任務 ${task.id} 的所有檔案嗎？`, task.id)
                            }}
                            disabled={deletingTaskId === task.id}
                            title='刪除任務'
                            aria-label='刪除任務'
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
              <DialogTitle>當前打包進度</DialogTitle>
              <DialogDescription>{liveTaskId ? `任務 ID: ${liveTaskId}` : "尚未啟動完整打包任務。"}</DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <Badge variant={statusVariant(liveTaskStatus || "outline")}>{liveTaskStatus || "idle"}</Badge>
                {liveTaskStatus === "running" ? (
                  <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                    打包進行中
                  </span>
                ) : null}
              </div>

              <div className='rounded-md border bg-muted/30 p-3'>
                <p className='text-xs text-muted-foreground'>最新進度</p>
                <p className='mt-1 text-sm break-all'>{liveLastLine || "等待任務輸出..."}</p>
              </div>

              <pre className='mono-box max-h-[420px]'>{liveTaskLog || "尚無 log。"}</pre>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={historyLogDialogOpen} onOpenChange={setHistoryLogDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle>任務 Log（Tail）</DialogTitle>
              <DialogDescription>{selectedTaskId ? `任務 ID: ${selectedTaskId}` : "尚未選擇任務。"}</DialogDescription>
            </DialogHeader>
            <pre className='mono-box max-h-[420px]'>{taskLog || "尚無 log。"}</pre>
          </DialogContent>
        </Dialog>

        <Dialog open={taskDetailDialogOpen} onOpenChange={setTaskDetailDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle>任務資訊與產物</DialogTitle>
              <DialogDescription>{selectedTaskId ? `任務 ID: ${selectedTaskId}` : "尚未選擇任務。"}</DialogDescription>
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
                    title='查看任務 Log'
                    aria-label='查看任務 Log'>
                    <ScrollText className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={onOpenSelectedTaskOutputDir}
                    disabled={!selectedTaskId || openingTaskFolder}
                    title='打開任務輸出資料夾'
                    aria-label='打開任務輸出資料夾'>
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
                          title='打開此 APK 所在資料夾'
                          aria-label={`打開 ${item.fileName} 所在資料夾`}>
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
                  <p className='text-sm text-muted-foreground'>此任務尚未找到 APK 產物。</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={manualSettingsDialogOpen} onOpenChange={setManualSettingsDialogOpen}>
          <DialogContent className='max-w-4xl'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Settings2 className='h-4 w-4' />
                手動模式設定
              </DialogTitle>
              <DialogDescription>請完成設定後確認，才會執行下一步打包流程。</DialogDescription>
            </DialogHeader>

            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <p className='text-xs text-muted-foreground'>依目前 config 下載/解析 patch 後產生預設選項。</p>
                <Button variant='outline' size='sm' onClick={onLoadManualOptions} disabled={buildManualLoading}>
                  {buildManualLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                  載入手動選項
                </Button>
              </div>

              <div className='max-h-[460px] overflow-auto pr-1'>
                {(buildManualOptions.apps || []).length > 0 ? (
                  <Tabs value={manualActiveTab} onValueChange={setManualActiveTab} className='space-y-3'>
                    <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-md border bg-background p-1'>
                      {(buildManualOptions.apps || []).map((app) => {
                        const appName = String(app?.appName || "")
                        return (
                          <TabsTrigger key={`manual-tab-${appName}`} value={appName} className='whitespace-nowrap'>
                            {appName}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>

                    {(buildManualOptions.apps || []).map((app) => {
                      const appName = String(app?.appName || "")
                      const appPlan = (buildManualPlan.apps && buildManualPlan.apps[appName]) || { version: "", patchIndices: [] }
                      const selectedIndices = new Set(Array.isArray(appPlan.patchIndices) ? appPlan.patchIndices : [])
                      const patches = Array.isArray(app?.patches) ? app.patches : []
                      const versions = Array.isArray(app?.versions) ? app.versions : []
                      return (
                        <TabsContent key={`manual-content-${appName}`} value={appName} className='mt-0'>
                          <div className='rounded-md border bg-background px-3 py-2 space-y-2'>
                            <div className='flex items-center justify-between gap-2'>
                              <p className='text-sm font-medium'>{appName}</p>
                              <Badge variant='outline'>{app?.appMode || "-"}</Badge>
                            </div>
                            {app?.error ? (
                              <p className='text-xs text-red-600 break-all'>{app.error}</p>
                            ) : (
                              <>
                                <div className='space-y-1'>
                                  <Label>APK 版本</Label>
                                  <Select
                                    value={hasText(appPlan.version) ? String(appPlan.version) : MANUAL_AUTO_VERSION_VALUE}
                                    onValueChange={(value) => updateManualVersion(appName, value === MANUAL_AUTO_VERSION_VALUE ? "" : value)}>
                                    <SelectTrigger>
                                      <SelectValue placeholder='provider default' />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={MANUAL_AUTO_VERSION_VALUE}>provider default</SelectItem>
                                      {versions.map((ver) => (
                                        <SelectItem key={`${appName}-${ver}`} value={String(ver)}>
                                          {String(ver)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className='space-y-1'>
                                  <Label>補丁選擇</Label>
                                  <div className='space-y-1 max-h-[160px] overflow-auto rounded-md border p-2'>
                                    {patches.map((patch) => (
                                      <label key={`${appName}-${patch.index}`} className='flex items-center gap-2 text-xs text-muted-foreground'>
                                        <Checkbox
                                          checked={selectedIndices.has(patch.index)}
                                          onCheckedChange={(checked) => updateManualPatchChecked(appName, patch.index, checked === true)}
                                        />
                                        <span className='font-mono text-foreground'>{patch.index}</span>
                                        <span className='break-all'>{patch.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TabsContent>
                      )
                    })}
                  </Tabs>
                ) : null}
                {(!buildManualOptions.apps || buildManualOptions.apps.length === 0) && !buildManualLoading ? (
                  <p className='text-xs text-muted-foreground'>尚未載入手動選項。</p>
                ) : null}
              </div>

              <Button
                className='w-full'
                onClick={onConfirmManualBuild}
                disabled={buildManualLoading || !buildManualOptions.apps || buildManualOptions.apps.length === 0}>
                <Play className='h-4 w-4' />
                確認並執行下一步
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={configPathDialogOpen} onOpenChange={setConfigPathDialogOpen}>
          <DialogContent className='max-w-xl'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <FileText className='h-4 w-4' />
                設定 Config 路徑
              </DialogTitle>
              <DialogDescription>修改要讀取與儲存的設定檔路徑。</DialogDescription>
            </DialogHeader>
            <div className='space-y-1'>
              <Label htmlFor='config-path'>Config 路徑</Label>
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
            }
          }}>
          <DialogContent className='max-w-2xl'>
            <DialogHeader>
              <DialogTitle>App 設定</DialogTitle>
              <DialogDescription>{editingApp?.displayName || editingApp?.name || "未選擇 App"}</DialogDescription>
            </DialogHeader>

            {editingApp ? (
              <div className='space-y-3'>
                <div className='app-grid'>
                  <div className='space-y-1'>
                    <Label htmlFor={`${editingApp.id}-display`}>App</Label>
                    <Input id={`${editingApp.id}-display`} value={editingApp.displayName || editingApp.name} disabled />
                  </div>

                  <div className='space-y-1'>
                    <Label htmlFor={`${editingApp.id}-package`}>package_name</Label>
                    <Input id={`${editingApp.id}-package`} value={editingApp.packageName || ""} disabled />
                  </div>

                  <div className='grid gap-3 md:col-span-2 md:grid-cols-2'>
                    <div className='space-y-1'>
                      <Label htmlFor={`${editingApp.id}-mode`}>mode</Label>
                      <Select value={editingApp.mode} onValueChange={(value) => updateApp(editingApp.id, { mode: value })}>
                        <SelectTrigger id={`${editingApp.id}-mode`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='remote'>remote</SelectItem>
                          <SelectItem value='local'>local</SelectItem>
                          <SelectItem value='false'>false (skip)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='space-y-1'>
                      <Label htmlFor={`${editingApp.id}-ver`}>ver</Label>
                      <div className='flex items-center gap-2'>
                        <Select
                          value={hasText(editingApp.ver) ? String(editingApp.ver) : APP_VER_AUTO_VALUE}
                          onValueChange={(value) => updateApp(editingApp.id, { ver: value === APP_VER_AUTO_VALUE ? "" : value })}>
                          <SelectTrigger id={`${editingApp.id}-ver`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={APP_VER_AUTO_VALUE}>auto</SelectItem>
                            {(appVersionOptions[editingApp.id]?.versions || []).map((ver) => (
                              <SelectItem key={`${editingApp.id}-${ver}`} value={String(ver)}>
                                {String(ver)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          onClick={() => loadAppVersions(editingApp)}
                          disabled={appVersionLoadingId === editingApp.id}
                          title='重新查詢可用版本'
                          aria-label='重新查詢可用版本'>
                          {appVersionLoadingId === editingApp.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                        </Button>
                      </div>
                      <p className='text-xs text-muted-foreground break-all'>
                        {appVersionError
                          ? appVersionError
                          : appVersionOptions[editingApp.id]?.any
                            ? "patch 相容版本為 Any，建議使用 auto。"
                            : `可用版本：${(appVersionOptions[editingApp.id]?.versions || []).length}`}
                      </p>
                    </div>
                  </div>
                </div>

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
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={morpheSettingsOpen} onOpenChange={setMorpheSettingsOpen}>
          <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Settings2 className='h-4 w-4' />
                morphe-cli 設定
              </DialogTitle>
            </DialogHeader>
            <div className='border-b pb-3'>
              <RadioGroup
                value={configForm.morpheCli.mode === "local" ? "local" : "remote"}
                onValueChange={(value) => {
                  if (value === "local") {
                    updateConfigSection("morpheCli", { mode: "local" })
                    return
                  }
                  const nextRemoteMode = configForm.morpheCli.mode === "dev" ? "dev" : "stable"
                  updateConfigSection("morpheCli", { mode: nextRemoteMode })
                }}
                className='grid grid-cols-2 gap-2'>
                <Label
                  htmlFor='morphe-mode-remote'
                  className={cn(
                    "flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-base transition-colors",
                    configForm.morpheCli.mode !== "local" ? "bg-sky-100 text-sky-900" : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}>
                  <RadioGroupItem id='morphe-mode-remote' value='remote' className='sr-only' />
                  <Cloud className='h-5 w-5' />
                  <span className='text-sm'>remote 模式</span>
                </Label>
                <Label
                  htmlFor='morphe-mode-local'
                  className={cn(
                    "flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-base transition-colors",
                    configForm.morpheCli.mode === "local" ? "bg-sky-100 text-sky-900" : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}>
                  <RadioGroupItem id='morphe-mode-local' value='local' className='sr-only' />
                  <HardDrive className='h-5 w-5' />
                  <span className='text-sm'>local 模式</span>
                </Label>
              </RadioGroup>
            </div>
            <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
              <div className='config-grid'>
                {configForm.morpheCli.mode !== "local" ? (
                  <div className='space-y-1'>
                    <Label htmlFor='morphe-remote-channel'>remote channel</Label>
                    <Select
                      value={configForm.morpheCli.mode === "dev" ? "dev" : "stable"}
                      onValueChange={(value) => updateConfigSection("morpheCli", { mode: value === "dev" ? "dev" : "stable" })}>
                      <SelectTrigger id='morphe-remote-channel'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='stable'>stable (latest)</SelectItem>
                        <SelectItem value='dev'>dev (latest)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {configForm.morpheCli.mode !== "local" ? (
                  <div className='space-y-1'>
                    <Label htmlFor='morphe-repo'>patches_repo</Label>
                    <Input
                      id='morphe-repo'
                      value={configForm.morpheCli.patchesRepo}
                      onChange={(event) => updateConfigSection("morpheCli", { patchesRepo: event.target.value })}
                      placeholder='MorpheApp/morphe-cli'
                    />
                  </div>
                ) : null}
              </div>
              {configForm.morpheCli.mode !== "local" ? (
                <div className='mt-3 flex flex-wrap items-center gap-2'>
                  <Button variant='outline' size='sm' onClick={onProbeMorpheCli} disabled={morpheProbeLoading}>
                    {morpheProbeLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <FlaskConical className='h-4 w-4' />}
                    測試
                  </Button>
                  {morpheProbeResult ? <p className='text-xs text-muted-foreground break-all'>{morpheProbeResult}</p> : null}
                </div>
              ) : null}
              {configForm.morpheCli.mode === "local" ? (
                <div className='mt-3 space-y-2 rounded-md bg-muted/40 p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <div className='relative'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => setMorpheSourcePopoverOpen((prev) => !prev)}
                          className='bg-sky-50 text-sky-800 hover:bg-sky-100'>
                          下載來源
                        </Button>
                        {morpheSourcePopoverOpen ? (
                          <div className='absolute left-0 top-full z-20 mt-2 w-[340px] max-w-[calc(100vw-4rem)] space-y-2 rounded-md bg-background/95 p-3 shadow-md'>
                            <div className='space-y-1'>
                              <Label htmlFor='morphe-source-repo'>倉庫</Label>
                              <Select value={morpheSourceRepo} onValueChange={setMorpheSourceRepo}>
                                <SelectTrigger id='morphe-source-repo'>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value='MorpheApp/morphe-cli'>MorpheApp/morphe-cli</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className='space-y-1'>
                              <Label htmlFor='morphe-source-version'>版本</Label>
                              <Select
                                value={morpheSourceVersion || "__NONE__"}
                                onValueChange={(value) => setMorpheSourceVersion(value === "__NONE__" ? "" : value)}>
                                <SelectTrigger id='morphe-source-version'>
                                  <SelectValue placeholder='選擇可下載版本' />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value='__NONE__'>未選擇</SelectItem>
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
                              下載
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Button variant='ghost' size='sm' onClick={loadMorpheLocalFiles} disabled={morpheFilesLoading} className='hover:bg-muted/60'>
                        {morpheFilesLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                        刷新
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() =>
                          openConfirmDialog("delete-all-morphe-files", "刪除全部 morphe-cli 檔案", "確定要刪除全部 morphe-cli 本地檔案嗎？")
                        }
                        disabled={morpheDeleteAllLoading || morpheLocalFiles.length === 0}
                        aria-label='刪除全部'
                        title='刪除全部'
                        className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                        {morpheDeleteAllLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      </Button>
                    </div>
                  </div>
                  <RadioGroup
                    value={configForm.morpheCli.path || "__NONE__"}
                    onValueChange={(value) => updateConfigSection("morpheCli", { path: value === "__NONE__" ? "" : value })}
                    className='space-y-1 max-h-[180px] overflow-auto'>
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
                            <span className='min-w-0'>
                              <span className='block text-xs font-medium break-all'>{file.name}</span>
                              <span className='block text-[11px] text-muted-foreground break-all'>{file.relativePath}</span>
                              <span className='block text-[11px] text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                            </span>
                          </label>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={(event) => {
                              event.stopPropagation()
                              openConfirmDialog("delete-morphe-file", "刪除 morphe-cli 檔案", `刪除 morphe-cli 檔案 ${file.relativePath}？`, file)
                            }}
                            disabled={morpheDeleteName === file.relativePath}
                            className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                            {morpheDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className='text-xs text-muted-foreground'>尚無本地 morphe-cli 檔案。</p>
                    )}
                  </RadioGroup>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={patchesSettingsOpen} onOpenChange={setPatchesSettingsOpen}>
          <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Package className='h-4 w-4' />
                patches 設定
              </DialogTitle>
            </DialogHeader>
            <div className='border-b pb-3'>
              <RadioGroup
                value={configForm.patches.mode === "local" ? "local" : "remote"}
                onValueChange={(value) => {
                  if (value === "local") {
                    updateConfigSection("patches", { mode: "local" })
                    return
                  }
                  const nextRemoteMode = configForm.patches.mode === "dev" ? "dev" : "stable"
                  updateConfigSection("patches", { mode: nextRemoteMode })
                }}
                className='grid grid-cols-2 gap-2'>
                <Label
                  htmlFor='patches-mode-remote'
                  className={cn(
                    "flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-base transition-colors",
                    configForm.patches.mode !== "local" ? "bg-sky-100 text-sky-900" : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}>
                  <RadioGroupItem id='patches-mode-remote' value='remote' className='sr-only' />
                  <Cloud className='h-5 w-5' />
                  <span className='text-sm'>remote 模式</span>
                </Label>
                <Label
                  htmlFor='patches-mode-local'
                  className={cn(
                    "flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-base transition-colors",
                    configForm.patches.mode === "local" ? "bg-sky-100 text-sky-900" : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}>
                  <RadioGroupItem id='patches-mode-local' value='local' className='sr-only' />
                  <HardDrive className='h-5 w-5' />
                  <span className='text-sm'>local 模式</span>
                </Label>
              </RadioGroup>
            </div>
            <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
              <div className='config-grid'>
                {configForm.patches.mode === "local" ? (
                  <div className='space-y-1'>
                    <Label>path</Label>
                    <p className='text-xs text-muted-foreground break-all'>{configForm.patches.path || "請從下方本地檔案清單選擇"}</p>
                  </div>
                ) : (
                  <div className='space-y-1'>
                    <Label htmlFor='patches-remote-channel'>remote channel</Label>
                    <Select
                      value={configForm.patches.mode === "dev" ? "dev" : "stable"}
                      onValueChange={(value) => updateConfigSection("patches", { mode: value === "dev" ? "dev" : "stable" })}>
                      <SelectTrigger id='patches-remote-channel'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='stable'>stable</SelectItem>
                        <SelectItem value='dev'>dev</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {configForm.patches.mode !== "local" ? (
                  <div className='space-y-1'>
                    <Label htmlFor='patches-repo'>patches_repo</Label>
                    <Input
                      id='patches-repo'
                      value={configForm.patches.patchesRepo}
                      onChange={(event) => updateConfigSection("patches", { patchesRepo: event.target.value })}
                      placeholder='MorpheApp/morphe-patches'
                    />
                  </div>
                ) : null}
              </div>
              {configForm.patches.mode !== "local" ? (
                <div className='mt-3 flex flex-wrap items-center gap-2'>
                  <Button variant='outline' size='sm' onClick={onProbePatches} disabled={patchesProbeLoading}>
                    {patchesProbeLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <FlaskConical className='h-4 w-4' />}
                    測試
                  </Button>
                  {patchesProbeResult ? <p className='text-xs text-muted-foreground break-all'>{patchesProbeResult}</p> : null}
                </div>
              ) : null}
              {configForm.patches.mode === "local" ? (
                <div className='mt-3 space-y-2 rounded-md bg-muted/40 p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <p className='text-xs text-muted-foreground break-all'>{patchesLocalDir || "-"}</p>
                    <div className='flex items-center gap-2'>
                      <Button variant='ghost' size='sm' onClick={loadPatchesLocalFiles} disabled={patchesFilesLoading} className='hover:bg-muted/60'>
                        {patchesFilesLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                        刷新
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => openConfirmDialog("delete-all-patches-files", "刪除全部 patches 檔案", "確定要刪除全部 patches 本地檔案嗎？")}
                        disabled={patchesDeleteAllLoading || patchesLocalFiles.length === 0}
                        aria-label='刪除全部'
                        title='刪除全部'
                        className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                        {patchesDeleteAllLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                      </Button>
                    </div>
                  </div>
                  <RadioGroup
                    value={configForm.patches.path || "__NONE__"}
                    onValueChange={(value) => updateConfigSection("patches", { path: value === "__NONE__" ? "" : value })}
                    className='space-y-1 max-h-[180px] overflow-auto'>
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
                            <span className='min-w-0'>
                              <span className='block text-xs font-medium break-all'>{file.name}</span>
                              <span className='block text-[11px] text-muted-foreground break-all'>{file.relativePath}</span>
                              <span className='block text-[11px] text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                            </span>
                          </label>
                          <Button
                            variant='ghost'
                            size='icon'
                            onClick={(event) => {
                              event.stopPropagation()
                              openConfirmDialog("delete-patches-file", "刪除 patches 檔案", `刪除 patches 檔案 ${file.relativePath}？`, file)
                            }}
                            disabled={patchesDeleteName === file.relativePath}
                            className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                            {patchesDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className='text-xs text-muted-foreground'>尚無本地 patches 檔案。</p>
                    )}
                  </RadioGroup>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmDialog.open} onOpenChange={(open) => (!open ? closeConfirmDialog() : null)}>
          <DialogContent className='max-w-md'>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title || "確認操作"}</DialogTitle>
              <DialogDescription>{confirmDialog.description || "請確認是否繼續執行此操作。"}</DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button variant='ghost' onClick={closeConfirmDialog} disabled={confirmDialogBusy}>
                取消
              </Button>
              <Button variant='destructive' onClick={onConfirmDialogAction} disabled={confirmDialogBusy}>
                {confirmDialogBusy ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                確認
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

export default App
