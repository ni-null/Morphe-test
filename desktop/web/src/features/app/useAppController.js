import { useEffect, useMemo, useRef, useState } from "react"
import { Archive, Database, Hammer } from "lucide-react"
import {
  fetchConfig,
  fetchPackageMap,
  saveConfig,
  fetchAppCompatibleVersions,
  fetchAppPatchOptions,
  checkJavaVersion,
  clearAllCache,
  deleteAllTasks,
  deleteTask,
  fetchTask,
  fetchTaskLog,
  fetchTaskArtifacts,
  listTasks,
  openTaskArtifactDir,
  openTaskOutputDir,
  startTask,
  stopTask,
  deleteSourceFile,
  deleteDownloadedApk,
  fetchAndSaveSource,
  fetchSourceVersions,
  listDownloadedApks,
  browseLocalApkPath,
  listSourceFiles,
  openAssetsDir,
} from "../../api"
import { t as translate } from "../../i18n"
import { useUiStore } from "../../stores/uiStore"
import { useDialogStore } from "../../stores/dialogStore"
import {
  LIVE_BUILD_TASK_ID_KEY,
  MORPHE_SOURCE_REPOS_KEY,
  PATCHES_SOURCE_REPOS_KEY,
  KEYSTORE_SELECTED_PATH_KEY,
  DEFAULT_MORPHE_SOURCE_REPO,
  DEFAULT_PATCHES_SOURCE_REPO,
  APP_VER_AUTO_VALUE,
  MORPHE_REMOTE_STABLE_VALUE,
  MORPHE_REMOTE_DEV_VALUE,
  PATCHES_REMOTE_STABLE_VALUE,
  PATCHES_REMOTE_DEV_VALUE,
  BUILD_STAGE_DEFINITIONS,
  hasText,
  normalizePackageIconPath,
  getPackageIconFallback,
  extractSourceFolderLabel,
  mergeRepoOptions,
  sortFilesByVersion,
  dedupeSourceVersions,
  packageToSectionName,
  customAppNameToSectionName,
  resolveDisplayName,
  createEmptyApp,
  createDefaultConfigForm,
  configFormFromToml,
  configFormToToml,
  buildTaskPayload,
  isBuildTask,
  statusVariant,
  formatTaskLabel,
  formatBytes,
  getPatchTranslation,
  pickSourceFileName,
  isNotFoundError,
  detectBuildStageIndexFromLine,
  DEFAULT_PACKAGE_META_MAP,
  getAppPresetTemplates,
} from "../../lib/app-core"

export const NAV_BUILD = "build"
export const NAV_HISTORY = "history"
export const NAV_ASSETS = "assets"

function useAppController() {
  const activeNav = useUiStore((state) => state.activeNav)
  const setActiveNav = useUiStore((state) => state.setActiveNav)
  const locale = useUiStore((state) => state.locale)
  const setLocale = useUiStore((state) => state.setLocale)
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const logDialogOpen = useDialogStore((state) => state.logDialogOpen)
  const setLogDialogOpen = useDialogStore((state) => state.setLogDialogOpen)
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

  const [configPath, setConfigPath] = useState("toml/default.toml")
  const [configForm, setConfigForm] = useState(createDefaultConfigForm)
  const [rawConfigInput, setRawConfigInput] = useState("")
  const [rawOverrideMode, setRawOverrideMode] = useState(false)

  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLogs, setTaskLogs] = useState({})
  const [taskArtifacts, setTaskArtifacts] = useState([])
  const [taskOutputDir, setTaskOutputDir] = useState("")
  const [buildGeneratedApks, setBuildGeneratedApks] = useState([])
  const [buildGeneratedApksLoading, setBuildGeneratedApksLoading] = useState(false)
  const [deletingAllTasks, setDeletingAllTasks] = useState(false)
  const [clearingAllCache, setClearingAllCache] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState("")
  const [openingTaskFolder, setOpeningTaskFolder] = useState(false)
  const [openingArtifactPath, setOpeningArtifactPath] = useState("")
  const [liveTaskId, setLiveTaskId] = useState("")
  const [liveTask, setLiveTask] = useState(null)
  const [liveTaskLog, setLiveTaskLog] = useState("")
  const [logDialogTaskId, setLogDialogTaskId] = useState("")
  const [buildLaunchPending, setBuildLaunchPending] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [isAutoSavingConfig, setIsAutoSavingConfig] = useState(false)
  const [morpheLocalFiles, setMorpheLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [keystoreFiles, setKeystoreFiles] = useState([])
  const [selectedKeystorePath, setSelectedKeystorePath] = useState(() => {
    try {
      return String(globalThis?.localStorage?.getItem(KEYSTORE_SELECTED_PATH_KEY) || "").trim()
    } catch {
      return ""
    }
  })
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
  const [patchesSourceDownloading, setPatchesSourceDownloading] = useState(false)
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
  const [apkDeletePath, setApkDeletePath] = useState("")
  const [pendingOverwriteApps, setPendingOverwriteApps] = useState([])
  const [packageMetaMap, setPackageMetaMap] = useState(() => DEFAULT_PACKAGE_META_MAP)
  const [javaEnv, setJavaEnv] = useState({
    loading: false,
    nodeVersion: "",
    installed: null,
    version: "",
    error: "",
  })

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

  const generatedToml = useMemo(() => {
    const base = configForm && typeof configForm === "object" ? configForm : createDefaultConfigForm()
    const nextSigning = {
      ...(base.signing || {}),
      keystorePath: hasText(selectedKeystorePath) ? String(selectedKeystorePath).trim() : String(base?.signing?.keystorePath || "").trim(),
    }
    return configFormToToml({
      ...base,
      signing: nextSigning,
    })
  }, [configForm, selectedKeystorePath])
  const t = (key, vars = {}) => translate(locale, key, vars)

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
      return
    }
    root.classList.remove("dark")
  }, [theme])

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

  function appendApp() {
    try {
      const templates = getAppPresetTemplates()
      if (templates.length === 0) {
        setMessage(t("msg.noTemplates"))
        return
      }

      const existingPackages = new Map(
        configForm.apps
          .map((app, index) => [
            String(app.packageName || "")
              .trim()
              .toLowerCase(),
            index,
          ])
          .filter(([key]) => key.length > 0),
      )

      const overwriteApps = []
      const newAppNames = []

      for (const template of templates) {
        const packageName = String(template?.packageName || "").trim()
        const packageKey = packageName.toLowerCase()
        const label = hasText(template?.displayName) ? String(template.displayName).trim() : resolveDisplayName(packageName, "")

        if (existingPackages.has(packageKey)) {
          overwriteApps.push({ template, label })
        } else {
          newAppNames.push(label)
        }
      }

      if (overwriteApps.length > 0) {
        const appNames = overwriteApps.map((item) => item.label).join(", ")
        setPendingOverwriteApps(overwriteApps)
        openConfirmDialog("overwrite-preset-apps", t("dialog.overwriteApps"), `${t("msg.appsExistConfirm", { apps: appNames })}`)
      } else {
        // Only new apps, add them directly
        doAppendNewApps(templates)
      }
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  function doAppendNewApps(templates) {
    let addedCount = 0
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
        const packageName = String(template?.packageName || "").trim()
        const section = hasText(template?.name) ? String(template.name).trim() : packageToSectionName(packageName)
        const label = hasText(template?.displayName) ? String(template.displayName).trim() : resolveDisplayName(packageName, section)
        const sectionKey = section.toLowerCase()
        const packageKey = packageName.toLowerCase()

        if (packageIndexByKey.has(packageKey)) continue
        if (existingSections.has(sectionKey)) continue

        const newApp = createEmptyApp(section, { packageName, displayName: label })
        if (template?.mode) newApp.mode = String(template.mode)
        if (template?.patches_mode) newApp.patchesMode = String(template.patches_mode).replace(/_/g, "-")
        if (Array.isArray(template?.patches)) newApp.patches = template.patches
        if (template?.apkmirror_dlurl) newApp.apkmirrorDlurl = String(template.apkmirror_dlurl)
        if (template?.uptodown_dlurl) newApp.uptodownDlurl = String(template.uptodown_dlurl)
        if (template?.archive_dlurl) newApp.archiveDlurl = String(template.archive_dlurl)
        nextApps.push(newApp)
        existingSections.add(sectionKey)
        addedCount += 1
      }

      return addedCount > 0 ? { ...prev, apps: nextApps } : prev
    })

    if (addedCount > 0) {
      setMessage(t("msg.templatesLoaded", { added: addedCount, renamed: 0 }))
    } else {
      setMessage(t("msg.allTemplatesLoaded"))
    }
  }

  function doOverwriteApps() {
    let updatedCount = 0
    setConfigForm((prev) => {
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

      for (const { template } of pendingOverwriteApps) {
        const packageName = String(template?.packageName || "").trim()
        const packageKey = packageName.toLowerCase()
        const existingIndex = packageIndexByKey.get(packageKey)

        if (Number.isInteger(existingIndex)) {
          const existingApp = nextApps[existingIndex]
          const updatedApp = { ...existingApp }
          if (template?.mode) updatedApp.mode = String(template.mode)
          if (template?.patches_mode) updatedApp.patchesMode = String(template.patches_mode).replace(/_/g, "-")
          if (Array.isArray(template?.patches) && template.patches.length > 0) updatedApp.patches = template.patches
          if (template?.apkmirror_dlurl) updatedApp.apkmirrorDlurl = String(template.apkmirror_dlurl)
          if (template?.uptodown_dlurl) updatedApp.uptodownDlurl = String(template.uptodown_dlurl)
          if (template?.archive_dlurl) updatedApp.archiveDlurl = String(template.archive_dlurl)
          nextApps[existingIndex] = updatedApp
          updatedCount += 1
        }
      }

      return updatedCount > 0 ? { ...prev, apps: nextApps } : prev
    })

    setPendingOverwriteApps([])
    if (updatedCount > 0) {
      setMessage(t("msg.appsOverwritten", { count: updatedCount }))
    }
  }

  function appendCustomApp(rawName, rawPackageName) {
    const displayName = String(rawName || "").trim()
    const packageName = String(rawPackageName || "").trim()
    if (!displayName || !packageName) return false
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/u.test(packageName)) {
      setMessage(t("msg.invalidPackageName", { package: packageName }))
      return false
    }

    let added = false
    let duplicate = false
    let duplicatePackage = false

    setConfigForm((prev) => {
      const existsByLabel = prev.apps.some((app) => {
        const currentDisplay = String(app.displayName || app.name || "")
          .trim()
          .toLowerCase()
        return currentDisplay === displayName.toLowerCase()
      })
      if (existsByLabel) {
        duplicate = true
        return prev
      }
      const packageKey = packageName.toLowerCase()
      const existsByPackage = prev.apps.some((app) => {
        const currentPackage = String(app.packageName || "")
          .trim()
          .toLowerCase()
        return currentPackage && currentPackage === packageKey
      })
      if (existsByPackage) {
        duplicatePackage = true
        return prev
      }

      const existingSections = new Set(
        prev.apps
          .map((app) =>
            String(app.name || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      )

      const base = customAppNameToSectionName(displayName)
      let sectionName = base
      let suffix = 2
      while (existingSections.has(sectionName.toLowerCase())) {
        sectionName = `${base}_${suffix}`
        suffix += 1
      }

      const newApp = createEmptyApp(sectionName, {
        displayName,
        packageName,
      })
      newApp.mode = "false"
      added = true
      return {
        ...prev,
        apps: [...prev.apps, newApp],
      }
    })

    if (duplicate) {
      setMessage(t("msg.appNameExists", { name: displayName }))
      return false
    }
    if (duplicatePackage) {
      setMessage(t("msg.packageNameExists", { package: packageName }))
      return false
    }
    if (added) {
      setMessage(t("msg.appAdded", { name: displayName }))
      return true
    }
    return false
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
        entries
          .map((entry) =>
            String(entry?.name || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      )
      const selectedNames = Array.isArray(app?.patches) ? app.patches.map((name) => String(name || "").trim()).filter(Boolean) : []
      const unsupportedNames = selectedNames.filter(
        (name) =>
          !supportedNamesLower.has(
            String(name || "")
              .trim()
              .toLowerCase(),
          ),
      )
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
          setMessage(
            locale === "zh-TW"
              ? "目前 mpp 無可用預設補丁，保留目前勾選。"
              : "No usable default patches found in current mpp. Keeping current selections.",
          )
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
    try {
      const data = await listDownloadedApks()
      const files = sortFilesByVersion(Array.isArray(data?.files) ? data.files : [])
      setDownloadedApkFiles(files)
    } catch (error) {
      setDownloadedApkFiles([])
      setMessage(error.message || String(error))
    }
  }

  async function onOpenAssetsDir(kind) {
    const target = String(kind || "").trim()
    if (!target) return
    try {
      const data = await openAssetsDir(target)
      setMessage(t("msg.opened", { path: data?.path || target }))
      if (target.toLowerCase() === "keystore") {
        loadKeystoreFiles()
      }
    } catch (error) {
      setMessage(error.message || String(error))
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
      setSelectedKeystorePath(String(nextForm?.signing?.keystorePath || "").trim())
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

  async function loadJavaEnvironment() {
    setJavaEnv((prev) => ({ ...prev, loading: true, error: "" }))
    try {
      const data = await checkJavaVersion()
      setJavaEnv({
        loading: false,
        nodeVersion: String(data?.nodeVersion || "").trim(),
        installed: data?.installed === true,
        version: String(data?.version || "").trim(),
        error: String(data?.error || "").trim(),
      })
    } catch (error) {
      setJavaEnv({
        loading: false,
        nodeVersion: "",
        installed: false,
        version: "",
        error: error?.message || String(error),
      })
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
      setSelectedKeystorePath(String(nextForm?.signing?.keystorePath || "").trim())
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
    try {
      const data = await fetchSourceVersions({
        type: "morphe-cli",
        repo,
      })
      const versions = dedupeSourceVersions(data?.versions)
      const localFileNameSet = new Set(
        morpheLocalFiles
          .map((file) =>
            String(file?.name || file?.fileName || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      )
      const firstUndownloaded = versions.find(
        (item) =>
          !localFileNameSet.has(
            String(item?.fileName || "")
              .trim()
              .toLowerCase(),
          ),
      )
      setMorpheSourceVersions(versions)
      setMorpheSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
    } catch (error) {
      setMorpheSourceVersions([])
      setMorpheSourceVersion("")
      setMessage(error.message || String(error))
    }
  }

  async function validateSourceRepoExists(type, repo) {
    const targetType = String(type || "").trim()
    const targetRepo = String(repo || "").trim()
    if (!targetType || !targetRepo) return false
    try {
      await fetchSourceVersions({
        type: targetType,
        repo: targetRepo,
      })
      return true
    } catch (error) {
      setMessage(error.message || String(error))
      return false
    }
  }

  async function onAddMorpheSourceRepo() {
    const repo = String(morpheSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("morphe-cli", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(morpheSourceRepoOptions, repo, DEFAULT_MORPHE_SOURCE_REPO)
    setMorpheSourceRepoOptions(nextOptions)
    setMorpheSourceRepo(repo)
    updateConfigSection("morpheCli", { repoOptions: nextOptions })
    loadMorpheSourceVersions(repo)
    setMorpheSourceRepoDraft("")
    return true
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
      morpheSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
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
    try {
      const data = await fetchSourceVersions({
        type: "patches",
        repo,
      })
      const versions = dedupeSourceVersions(data?.versions)
      const localFileNameSet = new Set(
        patchesLocalFiles
          .map((file) =>
            String(file?.name || file?.fileName || "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      )
      const firstUndownloaded = versions.find(
        (item) =>
          !localFileNameSet.has(
            String(item?.fileName || "")
              .trim()
              .toLowerCase(),
          ),
      )
      setPatchesSourceVersions(versions)
      setPatchesSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
    } catch (error) {
      setPatchesSourceVersions([])
      setPatchesSourceVersion("")
      setMessage(error.message || String(error))
    }
  }

  async function onAddPatchesSourceRepo() {
    const repo = String(patchesSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("patches", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, repo, DEFAULT_PATCHES_SOURCE_REPO)
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(repo)
    updateConfigSection("patches", { repoOptions: nextOptions })
    loadPatchesSourceVersions(repo)
    setPatchesSourceRepoDraft("")
    return true
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
      patchesSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
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

  async function loadKeystoreFiles() {
    try {
      const data = await listSourceFiles("keystore")
      const files = Array.isArray(data?.files) ? data.files : []
      setKeystoreFiles(files)
      setSelectedKeystorePath((prev) => {
        const current = String(prev || "").trim()
        if (current && files.some((file) => String(file?.fullPath || "").trim() === current)) {
          return current
        }
        if (current) {
          return current
        }
        const defaultFile = files.find((file) => String(file?.name || "").trim().toLowerCase() === "morphe-test.keystore")
        if (defaultFile && hasText(defaultFile.fullPath)) {
          return String(defaultFile.fullPath).trim()
        }
        const first = files[0]
        if (first && hasText(first.fullPath)) {
          return String(first.fullPath).trim()
        }
        return ""
      })
    } catch (error) {
      setKeystoreFiles([])
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

  async function onDeleteDownloadedApkFile(file) {
    const fullPath = String(file?.fullPath || "").trim()
    if (!fullPath) return
    setApkDeletePath(fullPath)
    try {
      await deleteDownloadedApk(fullPath)
      await loadDownloadedApkFiles()
      setMessage(t("msg.deleted", { name: String(file?.name || file?.fileName || fullPath) }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setApkDeletePath("")
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
    await runBuildTask({
      dryRun: false,
      force: false,
    })
  }

  async function runBuildTask(flags = { dryRun: false, force: false }) {
    const isBuildRunningNow = String(liveTask?.status || "").toLowerCase() === "running"
    if (isBuildRunningNow || buildLaunchPending) {
      setMessage(t("msg.buildAlreadyRunning"))
      return
    }
    const missingLocalApkApp = (configForm.apps || []).find((app) => {
      if (String(app?.mode || "").toLowerCase() !== "local") return false
      return !hasText(app?.localApkCustomPath) && !hasText(app?.localApkSelectedPath)
    })
    if (missingLocalApkApp) {
      const appName = missingLocalApkApp.displayName || missingLocalApkApp.name || "app"
      setMessage(
        locale === "zh-TW"
          ? `[${appName}] local 模式需先選擇本地 APK 或輸入自訂路徑。`
          : `[${appName}] local mode requires a selected local APK or custom path.`,
      )
      return
    }
    setIsBusy(true)
    setBuildLaunchPending(true)
    try {
      const signingKeystorePath = hasText(selectedKeystorePath) ? String(selectedKeystorePath).trim() : ""
      const payload = buildTaskPayload(configPath, flags, signingKeystorePath)
      const data = await startTask(payload)
      if (data?.task) {
        setSelectedTaskId(data.task.id)
        setLiveTaskId(data.task.id)
        setLiveTask(data.task)
        localStorage.setItem(LIVE_BUILD_TASK_ID_KEY, data.task.id)
      }
      setMessage(t("msg.taskStarted"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
      setBuildLaunchPending(false)
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
            setTaskLogs((prev) => {
              const next = { ...prev }
              delete next[selectedTaskId]
              return next
            })
            setTaskArtifacts([])
            setTaskOutputDir("")
            return
          }
          setSelectedTask(selected)
        } else if (isNotFoundError(taskRes.reason)) {
          setSelectedTaskId("")
          setSelectedTask(null)
          setTaskLogs((prev) => {
            const next = { ...prev }
            delete next[selectedTaskId]
            return next
          })
          setTaskArtifacts([])
          setTaskOutputDir("")
          return
        } else {
          setMessage(taskRes.reason?.message || String(taskRes.reason))
        }

        if (logRes.status === "fulfilled") {
          setTaskLogs((prev) => ({ ...prev, [selectedTaskId]: String(logRes.value?.content || "") }))
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
          setTaskLogs((prev) => {
            const next = { ...prev }
            delete next[selectedTaskId]
            return next
          })
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

  async function onOpenGeneratedApkDir(item) {
    const taskId = String(item?.taskId || "").trim()
    const relativePath = String(item?.relativePath || "").trim()
    if (!taskId || !relativePath) return
    try {
      const data = await openTaskArtifactDir(taskId, relativePath)
      setMessage(t("msg.opened", { path: data.path || relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
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
        setTaskLogs((prev) => {
          const next = { ...prev }
          delete next[String(taskId || "")]
          return next
        })
        setTaskArtifacts([])
        setTaskOutputDir("")
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
      setTaskLogs({})
      setTaskArtifacts([])
      setTaskOutputDir("")
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
      } else if (action === "delete-apk-file") {
        await onDeleteDownloadedApkFile(payload)
      } else if (action === "delete-task") {
        await onDeleteTask(String(payload || ""))
      } else if (action === "delete-all-tasks") {
        await onDeleteAllTasks()
      } else if (action === "clear-all-cache") {
        await onClearAllCache()
      } else if (action === "overwrite-preset-apps") {
        doOverwriteApps()
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
    if (!hasText(selectedKeystorePath)) {
      localStorage.removeItem(KEYSTORE_SELECTED_PATH_KEY)
      return
    }
    localStorage.setItem(KEYSTORE_SELECTED_PATH_KEY, selectedKeystorePath)
  }, [selectedKeystorePath])

  useEffect(() => {
    const status = String(liveTask?.status || "").toLowerCase()
    if (!status) return
    if (["running", "stopping"].includes(status)) return
    setBuildLaunchPending(false)
  }, [liveTask?.status])

  useEffect(() => {
    if (morpheSettingsOpen) {
      const nextOptions = mergeRepoOptions(configForm?.morpheCli?.repoOptions, "", DEFAULT_MORPHE_SOURCE_REPO)
      const current = String(morpheSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
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
      const current = String(patchesSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
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
    if (activeNav !== NAV_ASSETS && activeNav !== NAV_BUILD) return
    loadMorpheLocalFiles()
    loadPatchesLocalFiles()
    loadKeystoreFiles()
    if (activeNav === NAV_BUILD) return
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

  useEffect(() => {
    loadJavaEnvironment()
  }, [])

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
    if (item && hasText(item.icon)) return normalizePackageIconPath(item.icon)
    return getPackageIconFallback(key)
  }
  const completedBuildTaskSignature = useMemo(() => {
    return tasks
      .filter((task) => String(task?.status || "").toLowerCase() === "completed")
      .slice(0, 12)
      .map((task) => String(task?.id || ""))
      .join("|")
  }, [tasks])

  useEffect(() => {
    if (activeNav !== NAV_BUILD) return

    const completedTasks = tasks
      .filter((task) => String(task?.status || "").toLowerCase() === "completed")
      .slice(0, 12)

    if (completedTasks.length === 0) {
      setBuildGeneratedApks([])
      setBuildGeneratedApksLoading(false)
      return
    }

    let canceled = false
    setBuildGeneratedApksLoading(true)

    Promise.allSettled(
      completedTasks.map(async (task) => {
        const taskId = String(task?.id || "").trim()
        if (!taskId) return []
        const data = await fetchTaskArtifacts(taskId)
        const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : []
        return artifacts.map((item) => ({
          taskId,
          taskStartedAt: String(task?.startedAt || ""),
          fileName: String(item?.fileName || ""),
          fullPath: String(item?.fullPath || ""),
          relativePath: String(item?.relativePath || ""),
          sizeBytes: Number(item?.sizeBytes || 0),
          modifiedAt: String(item?.modifiedAt || ""),
        }))
      }),
    )
      .then((results) => {
        if (canceled) return
        const dedup = new Map()
        for (const result of results) {
          if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue
          for (const item of result.value) {
            const key = String(item?.fullPath || "").trim() || `${item.taskId}:${item.relativePath}:${item.fileName}`
            if (!key) continue
            if (!dedup.has(key)) dedup.set(key, item)
          }
        }
        const merged = Array.from(dedup.values())
        merged.sort((a, b) => {
          const aTime = Date.parse(String(a?.modifiedAt || ""))
          const bTime = Date.parse(String(b?.modifiedAt || ""))
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime
          return String(a?.fileName || "").localeCompare(String(b?.fileName || ""), undefined, { sensitivity: "base" })
        })
        setBuildGeneratedApks(merged)
      })
      .finally(() => {
        if (!canceled) setBuildGeneratedApksLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [activeNav, completedBuildTaskSignature])
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
  const buildProgressStages = useMemo(() => {
    const status = String(liveTask?.status || "").toLowerCase()
    const isWorking = buildLaunchPending || status === "running" || status === "stopping"
    const isFailed = status === "failed" || status === "canceled"
    const isCompleted = status === "completed"

    const lines = String(liveTaskLog || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)

    let furthestStageIndex = -1
    for (const line of lines) {
      const stageIndex = detectBuildStageIndexFromLine(line)
      if (stageIndex > furthestStageIndex) {
        furthestStageIndex = stageIndex
      }
    }

    const currentIndex = furthestStageIndex >= 0 ? furthestStageIndex : isWorking ? 0 : -1
    return BUILD_STAGE_DEFINITIONS.map((stage, index) => {
      let state = "pending"
      if (isCompleted) {
        state = index <= Math.max(currentIndex, 3) ? "done" : "pending"
      } else if (isFailed) {
        if (index < currentIndex) state = "done"
        if (index === currentIndex) state = "error"
      } else if (isWorking) {
        if (index < currentIndex) state = "done"
        if (index === currentIndex) state = "active"
      }
      return {
        key: stage.key,
        label: t(stage.labelKey),
        state,
      }
    })
  }, [buildLaunchPending, liveTask?.status, liveTaskLog, t])
  const selectedTaskLog = String(taskLogs[selectedTaskId] || "")
  const morpheCliSelectOptions = useMemo(() => {
    const options = [
      { value: MORPHE_REMOTE_STABLE_VALUE, label: "latest stable (MorpheApp/morphe-cli)", kind: "remote-stable" },
      { value: MORPHE_REMOTE_DEV_VALUE, label: "latest dev (MorpheApp/morphe-cli)", kind: "remote-dev" },
    ]
    const localItems = (Array.isArray(morpheLocalFiles) ? morpheLocalFiles : []).map((file) => ({
      value: String(file?.fullPath || "").trim(),
      label: String(file?.name || "").trim() || String(file?.relativePath || "").trim(),
      folderLabel: extractSourceFolderLabel(file),
      kind: "local-file",
    }))
    for (const item of localItems) {
      if (!hasText(item.value) || !hasText(item.label)) continue
      if (options.some((option) => option.value === item.value)) continue
      options.push(item)
    }
    return options
  }, [morpheLocalFiles])

  const morpheCliSelectValue = useMemo(() => {
    const mode = String(configForm?.morpheCli?.mode || "stable").trim().toLowerCase()
    if (mode === "dev") return MORPHE_REMOTE_DEV_VALUE
    if (mode === "stable") return MORPHE_REMOTE_STABLE_VALUE
    const localValue = String(configForm?.morpheCli?.path || "").trim()
    if (localValue && morpheCliSelectOptions.some((item) => item.value === localValue)) return localValue
    return MORPHE_REMOTE_STABLE_VALUE
  }, [configForm?.morpheCli?.mode, configForm?.morpheCli?.path, morpheCliSelectOptions])

  function onChangeMorpheCliSelect(value) {
    const selected = String(value || "").trim()
    if (!selected) return
    if (selected === MORPHE_REMOTE_STABLE_VALUE) {
      updateConfigSection("morpheCli", { mode: "stable" })
      return
    }
    if (selected === MORPHE_REMOTE_DEV_VALUE) {
      updateConfigSection("morpheCli", { mode: "dev" })
      return
    }
    updateConfigSection("morpheCli", { mode: "local", path: selected })
  }

  const patchesSelectOptions = useMemo(() => {
    const options = [
      { value: PATCHES_REMOTE_STABLE_VALUE, label: "latest stable (MorpheApp/morphe-patches)", kind: "remote-stable" },
      { value: PATCHES_REMOTE_DEV_VALUE, label: "latest dev (MorpheApp/morphe-patches)", kind: "remote-dev" },
    ]
    const localItems = (Array.isArray(patchesLocalFiles) ? patchesLocalFiles : []).map((file) => ({
      value: String(file?.fullPath || "").trim(),
      label: String(file?.name || "").trim() || String(file?.relativePath || "").trim(),
      folderLabel: extractSourceFolderLabel(file),
      kind: "local-file",
    }))
    for (const item of localItems) {
      if (!hasText(item.value) || !hasText(item.label)) continue
      if (options.some((option) => option.value === item.value)) continue
      options.push(item)
    }
    return options
  }, [patchesLocalFiles])

  const patchesSelectValue = useMemo(() => {
    const mode = String(configForm?.patches?.mode || "stable").trim().toLowerCase()
    if (mode === "dev") return PATCHES_REMOTE_DEV_VALUE
    if (mode === "stable") return PATCHES_REMOTE_STABLE_VALUE
    const localValue = String(configForm?.patches?.path || "").trim()
    if (localValue && patchesSelectOptions.some((item) => item.value === localValue)) return localValue
    return PATCHES_REMOTE_STABLE_VALUE
  }, [configForm?.patches?.mode, configForm?.patches?.path, patchesSelectOptions])

  function onChangePatchesSelect(value) {
    const selected = String(value || "").trim()
    if (!selected) return
    if (selected === PATCHES_REMOTE_STABLE_VALUE) {
      updateConfigSection("patches", { mode: "stable" })
      return
    }
    if (selected === PATCHES_REMOTE_DEV_VALUE) {
      updateConfigSection("patches", { mode: "dev" })
      return
    }
    updateConfigSection("patches", { mode: "local", path: selected })
  }

  const keystoreSelectOptions = useMemo(() => {
    return (Array.isArray(keystoreFiles) ? keystoreFiles : [])
      .map((file) => ({
        value: String(file?.fullPath || "").trim(),
        label: String(file?.name || file?.fileName || "").trim() || String(file?.relativePath || "").trim(),
        folderLabel: extractSourceFolderLabel(file),
      }))
      .filter((item) => hasText(item.value) && hasText(item.label))
  }, [keystoreFiles])

  const keystoreSelectValue = useMemo(() => {
    const selected = String(selectedKeystorePath || "").trim()
    if (selected && keystoreSelectOptions.some((item) => item.value === selected)) {
      return selected
    }
    const first = String(keystoreSelectOptions[0]?.value || "").trim()
    return first || "__NONE__"
  }, [selectedKeystorePath, keystoreSelectOptions])

  function onChangeKeystoreSelect(value) {
    const selected = String(value || "").trim()
    if (!selected || selected === "__NONE__") return
    setSelectedKeystorePath(selected)
  }

  const dialogTargetTaskId = String(logDialogTaskId || liveTaskId || selectedTaskId || "").trim()
  const dialogTargetTask = useMemo(() => {
    if (!dialogTargetTaskId) return null
    if (String(liveTaskId || "") === dialogTargetTaskId && liveTask) return liveTask
    if (selectedTask && String(selectedTask.id || "") === dialogTargetTaskId) return selectedTask
    return tasks.find((task) => String(task?.id || "") === dialogTargetTaskId) || null
  }, [dialogTargetTaskId, liveTaskId, liveTask, selectedTask, tasks])
  const dialogTargetStatus = String(String(liveTaskId || "") === dialogTargetTaskId ? liveTaskStatus : dialogTargetTask?.status || "")
  const dialogTargetLog = String(
    String(liveTaskId || "") === dialogTargetTaskId ? liveTaskLog : taskLogs[dialogTargetTaskId] || selectedTaskLog || "",
  )

  function onOpenLogDialog(taskId = "") {
    const target = String(taskId || "").trim()
    const fallback = String(liveTaskId || selectedTaskId || "").trim()
    const resolved = target || fallback
    if (!resolved) {
      setLogDialogTaskId("")
      setLogDialogOpen(true)
      return
    }
    if (target) {
      setSelectedTaskId(target)
    }
    setLogDialogTaskId(resolved)
    setLogDialogOpen(true)
  }

  function onLogDialogOpenChange(open) {
    setLogDialogOpen(open)
    if (!open) {
      setLogDialogTaskId("")
    }
  }

  const onAppSettingsOpenChange = (open) => {
    setAppSettingsOpen(open)
    if (!open) {
      setAppSettingsId("")
      setAppVersionError("")
      setAppPatchError("")
      setAppDlurlPopoverOpen(false)
      setAppUnsupportedPatches({})
    }
  }

  return {
    t,
    locale,
    setLocale,
    theme,
    setTheme,
    message,
    javaEnv,
    hasText,
    activeNav,
    setActiveNav,
    navItems,
    navKeys: {
      build: NAV_BUILD,
      assets: NAV_ASSETS,
      history: NAV_HISTORY,
    },
    buildPageProps: {
      t,
      isBuildRunning,
      buildLaunchPending,
      isBuildStopping,
      liveLastLine,
      liveTaskStartedAt: liveTask?.startedAt || "",
      buildProgressStages,
      onOpenLogDialog: () => onOpenLogDialog(liveTaskId),
      liveTaskId,
      onStopBuildTask,
      onBuildPrimaryAction,
      rawOverrideMode,
      onToggleRawMode,
      isBusy,
      setConfigPathDialogOpen,
      rawConfigInput,
      setRawConfigInputValue: setRawConfigInput,
      morpheCliSelectValue,
      morpheCliSelectOptions,
      onChangeMorpheCliSelect,
      patchesSelectValue,
      patchesSelectOptions,
      onChangePatchesSelect,
      keystoreSelectValue,
      keystoreSelectOptions,
      onChangeKeystoreSelect,
      appendApp,
      onAppendCustomApp: appendCustomApp,
      apps: configForm.apps,
      updateApp,
      getPackageIcon,
      hasText,
      setAppSettingsId,
      setAppSettingsOpen,
      buildGeneratedApks,
      buildGeneratedApksLoading,
      formatBytes,
      onOpenGeneratedApkDir,
    },
    assetsPageProps: {
      t,
      hasText,
      formatBytes,
      morpheSourceRepo,
      morpheSourceRepoOptions,
      morpheSourceRepoDraft,
      setMorpheSourceRepoDraft,
      onSelectMorpheSourceRepo,
      onAddMorpheSourceRepo,
      onDeleteMorpheSourceRepo,
      morpheSourceVersion,
      setMorpheSourceVersion,
      morpheSourceVersions,
      onDownloadMorpheFromSource,
      morpheSourceDownloading,
      morpheLocalFiles,
      openConfirmDialog,
      morpheDeleteName,
      patchesSourceRepo,
      patchesSourceRepoOptions,
      patchesSourceRepoDraft,
      setPatchesSourceRepoDraft,
      onSelectPatchesSourceRepo,
      onAddPatchesSourceRepo,
      onDeletePatchesSourceRepo,
      patchesSourceVersion,
      setPatchesSourceVersion,
      patchesSourceVersions,
      onDownloadPatchesFromSource,
      patchesSourceDownloading,
      patchesLocalFiles,
      patchesDeleteName,
      downloadedApkFiles,
      onOpenAssetsDir,
      apkDeletePath,
    },
    historyPageProps: {
      t,
      openConfirmDialog,
      clearingAllCache,
      deletingAllTasks,
      refreshTasks,
      isBusy,
      tasks,
      formatTaskLabel,
      statusVariant,
      deletingTaskId,
      onOpenTaskOutputDir: onOpenSelectedTaskOutputDir,
      openingTaskFolder,
      onOpenTaskLog: onOpenLogDialog,
    },
    taskDialogsProps: {
      t,
      logDialogOpen,
      setLogDialogOpen: onLogDialogOpenChange,
      taskId: dialogTargetTaskId,
      taskStatus: dialogTargetStatus,
      statusVariant,
      taskLog: dialogTargetLog,
    },
    configPathDialogProps: {
      open: configPathDialogOpen,
      onOpenChange: setConfigPathDialogOpen,
      t,
      configPath,
      setConfigPath,
    },
    appSettingsDialogProps: {
      open: appSettingsOpen,
      onOpenChange: onAppSettingsOpenChange,
      t,
      locale,
      editingApp,
      appDlurlPopoverOpen,
      setAppDlurlPopoverOpen,
      appLocalApkFiles,
      appLocalApkDir,
      appLocalApkLoading,
      onRefreshAppLocalApkFiles: () => loadAppLocalApkFiles(editingApp),
      onBrowseAppLocalApkPath: () => onBrowseAppLocalApkPath(editingApp),
      updateApp,
      hasText,
      appPatchOptions,
      appVersionOptions,
      appVersionLoadingId,
      appPatchLoadingId,
      loadAppVersions,
      loadAppPatchOptions,
      appVerAutoValue: APP_VER_AUTO_VALUE,
      appVersionError,
      appPatchError,
      appUnsupportedPatches,
      getPatchTranslation,
      toggleAppPatch,
    },
    morpheSettingsDialogProps: {
      open: morpheSettingsOpen,
      onOpenChange: setMorpheSettingsOpen,
      t,
      configForm,
      morpheLocalFiles,
      morpheStableValue: MORPHE_REMOTE_STABLE_VALUE,
      morpheDevValue: MORPHE_REMOTE_DEV_VALUE,
      updateConfigSection,
      formatBytes,
      openConfirmDialog,
      morpheDeleteName,
    },
    patchesSettingsDialogProps: {
      open: patchesSettingsOpen,
      onOpenChange: setPatchesSettingsOpen,
      t,
      configForm,
      patchesLocalFiles,
      patchesStableValue: PATCHES_REMOTE_STABLE_VALUE,
      patchesDevValue: PATCHES_REMOTE_DEV_VALUE,
      updateConfigSection,
      formatBytes,
      openConfirmDialog,
      patchesDeleteName,
    },
    confirmActionDialogProps: {
      open: confirmDialog.open,
      onOpenChange: (open) => (!open ? closeConfirmDialog() : null),
      title: confirmDialog.title,
      description: confirmDialog.description,
      t,
      busy: confirmDialogBusy,
      onCancel: closeConfirmDialog,
      onConfirm: onConfirmDialogAction,
    },
  }
}

export default useAppController
