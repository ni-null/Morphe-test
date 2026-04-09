import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
} from "../lib/ipcClient"
import { t as translate } from "../i18n"
import { useUiStore } from "../stores/uiStore"
import { useDialogStore } from "../stores/dialogStore"
import useConfigLifecycle from "./useConfigLifecycle"
import useConfigAutosave from "./useConfigAutosave"
import useTaskRuntime from "./useTaskRuntime"
import useTaskDialogState from "./useTaskDialogState"
import useSourceAssetsState from "../pages/AssetsPage/hooks/useSourceAssetsState"
import useBuildExecutionState from "../pages/BuildPage/hooks/useBuildExecutionState"
import useAppPatchSettingsState from "../pages/BuildPage/hooks/useAppPatchSettingsState"
import useBuildSourceSelectors from "../pages/BuildPage/hooks/useBuildSourceSelectors"
import { BUILD_STAGE_DEFINITIONS, detectBuildStageIndexFromLine } from "../pages/BuildPage/utils/buildProgressUtils"
import { formatBytes, formatTaskLabel, isNotFoundError, statusVariant } from "../lib/task-format-core"
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
  DEFAULT_PACKAGE_META_MAP,
} from "../lib/app-constants"
import {
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
  pickSourceFileName,
} from "../lib/app-utils"
import {
  normalizeAppMode,
  createEmptyApp,
  createDefaultConfigForm,
  configFormFromToml,
  configFormToToml,
  getAppPresetTemplates,
} from "../lib/app-config"
import { buildTaskPayload, isBuildTask } from "../lib/app-tasks"
import { getPatchTranslation } from "../lib/app-i18n"

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
  const confirmDialog = useDialogStore((state) => state.confirmDialog)
  const setConfirmDialog = useDialogStore((state) => state.setConfirmDialog)
  const confirmDialogBusy = useDialogStore((state) => state.confirmDialogBusy)
  const setConfirmDialogBusy = useDialogStore((state) => state.setConfirmDialogBusy)

  const [configPath, setConfigPath] = useState("toml/default.toml")
  const [configForm, setConfigForm] = useState(createDefaultConfigForm)
  const [rawConfigInput, setRawConfigInput] = useState("")
  const [rawOverrideMode, setRawOverrideMode] = useState(false)

  const [buildLaunchPending, setBuildLaunchPending] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [, setIsAutoSavingConfig] = useState(false)
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
  const t = useCallback((key, vars = {}) => translate(locale, key, vars), [locale])
  const setMessage = useCallback((value) => {
    const text = String(value ?? "").trim()
    if (text) {
      console.log(text)
    }
    setSidebarMessage("")
  }, [])
  const lastSavedSignatureRef = useRef("")
  const appSettingsCleanupTimerRef = useRef(null)

  const {
    tasks,
    selectedTaskId,
    setSelectedTaskId,
    selectedTask,
    taskLogs,
    taskArtifacts,
    taskOutputDir,
    deletingAllTasks,
    clearingAllCache,
    deletingTaskId,
    openingTaskFolder,
    openingArtifactPath,
    liveTaskId,
    setLiveTaskId,
    liveTask,
    setLiveTask,
    liveTaskLog,
    refreshTasks,
    onOpenSelectedTaskOutputDir,
    onOpenArtifactDir,
    onDeleteTask,
    onDeleteAllTasks,
    onClearAllCache,
  } = useTaskRuntime({
    t,
    setMessage,
    isBuildTask,
    isNotFoundError,
    listTasks,
    fetchTask,
    fetchTaskLog,
    fetchTaskArtifacts,
    deleteTask,
    deleteAllTasks,
    clearAllCache,
    openTaskOutputDir,
    openTaskArtifactDir,
    liveBuildTaskIdKey: LIVE_BUILD_TASK_ID_KEY,
  })

  const {
    morpheLocalFiles,
    patchesLocalFiles,
    keystoreFiles,
    selectedKeystorePath,
    setSelectedKeystorePath,
    morpheDeleteName,
    patchesDeleteName,
    morpheSourceRepoOptions,
    setMorpheSourceRepoOptions,
    morpheSourceRepo,
    setMorpheSourceRepo,
    morpheSourceRepoDraft,
    setMorpheSourceRepoDraft,
    morpheSourceVersions,
    morpheSourceVersion,
    setMorpheSourceVersion,
    morpheSourceDownloading,
    patchesSourceRepoOptions,
    setPatchesSourceRepoOptions,
    patchesSourceRepo,
    setPatchesSourceRepo,
    patchesSourceRepoDraft,
    setPatchesSourceRepoDraft,
    patchesSourceVersions,
    patchesSourceVersion,
    setPatchesSourceVersion,
    patchesSourceDownloading,
    onOpenAssetsDir,
    onAddMorpheSourceRepo,
    onSelectMorpheSourceRepo,
    onDeleteMorpheSourceRepo,
    onAddPatchesSourceRepo,
    onSelectPatchesSourceRepo,
    onDeletePatchesSourceRepo,
    onDeleteMorpheFile,
    onDeletePatchesFile,
    onDownloadMorpheFromSource,
    onDownloadPatchesFromSource,
    onChangeKeystoreSelect,
  } = useSourceAssetsState({
    activeNav,
    navAssetsKey: NAV_ASSETS,
    navBuildKey: NAV_BUILD,
    morpheSettingsOpen,
    patchesSettingsOpen,
    configForm,
    updateConfigSection,
    loadDownloadedApkFiles,
    setMessage,
    t,
    hasText,
    mergeRepoOptions,
    sortFilesByVersion,
    dedupeSourceVersions,
    pickSourceFileName,
    listSourceFiles,
    fetchSourceVersions,
    fetchAndSaveSource,
    deleteSourceFile,
    openAssetsDir,
    storageKeys: {
      morpheSourceReposKey: MORPHE_SOURCE_REPOS_KEY,
      patchesSourceReposKey: PATCHES_SOURCE_REPOS_KEY,
      keystoreSelectedPathKey: KEYSTORE_SELECTED_PATH_KEY,
    },
    defaults: {
      morpheSourceRepo: DEFAULT_MORPHE_SOURCE_REPO,
      patchesSourceRepo: DEFAULT_PATCHES_SOURCE_REPO,
    },
  })

  const { loadConfig, onToggleRawMode } = useConfigLifecycle({
    configPath,
    rawOverrideMode,
    setRawOverrideMode,
    setIsBusy,
    setConfigPath,
    setRawConfigInput,
    setConfigForm,
    setSelectedKeystorePath,
    setMorpheSourceRepoOptions,
    setPatchesSourceRepoOptions,
    lastSavedSignatureRef,
    setConfigLoaded,
    setMessage,
    fetchConfig,
    configFormFromToml,
    mergeRepoOptions,
    defaultMorpheSourceRepo: DEFAULT_MORPHE_SOURCE_REPO,
    defaultPatchesSourceRepo: DEFAULT_PATCHES_SOURCE_REPO,
  })

  const {
    editingApp,
    appVersionOptions,
    appPatchOptions,
    appUnsupportedPatches,
    appPatchLoadingId,
    appPatchStage,
    appVersionError,
    appPatchError,
    loadAppPatchOptions,
    onBrowseAppLocalApkPath,
    resetAppSettingsState,
  } = useAppPatchSettingsState({
    appSettingsOpen,
    appSettingsId,
    configPath,
    configForm,
    locale,
    setMessage,
    t,
    hasText,
    updateApp,
    fetchAppCompatibleVersions,
    fetchAppPatchOptions,
    browseLocalApkPath,
  })

  const {
    buildGeneratedApks,
    buildGeneratedApksLoading,
    liveTaskStatus,
    isBuildRunning,
    isBuildStopping,
    liveLastLine,
    buildProgressStages,
    onBuildPrimaryAction,
    onStopBuildTask,
    onOpenGeneratedApkDir,
  } = useBuildExecutionState({
    activeNav,
    navBuildKey: NAV_BUILD,
    tasks,
    liveTask,
    setLiveTask,
    liveTaskId,
    setLiveTaskId,
    liveTaskLog,
    selectedTaskId,
    setSelectedTaskId,
    buildLaunchPending,
    setBuildLaunchPending,
    setIsBusy,
    configPath,
    selectedKeystorePath,
    t,
    hasText,
    buildTaskPayload,
    startTask,
    stopTask,
    refreshTasks,
    fetchTaskArtifacts,
    openTaskArtifactDir,
    setMessage,
    buildStageDefinitions: BUILD_STAGE_DEFINITIONS,
    detectBuildStageIndexFromLine,
  })

  const {
    morpheCliSelectOptions,
    morpheCliSelectValue,
    onChangeMorpheCliSelect,
    patchesSelectOptions,
    patchesSelectValue,
    onChangePatchesSelect,
    keystoreSelectOptions,
    keystoreSelectValue,
  } = useBuildSourceSelectors({
    configForm,
    morpheLocalFiles,
    patchesLocalFiles,
    keystoreFiles,
    selectedKeystorePath,
    hasText,
    updateConfigSection,
    extractSourceFolderLabel,
    morpheRemoteStableValue: MORPHE_REMOTE_STABLE_VALUE,
    morpheRemoteDevValue: MORPHE_REMOTE_DEV_VALUE,
    patchesRemoteStableValue: PATCHES_REMOTE_STABLE_VALUE,
    patchesRemoteDevValue: PATCHES_REMOTE_DEV_VALUE,
    onChangeKeystoreSelect,
  })

  const {
    dialogTargetTaskId,
    dialogTargetStatus,
    dialogTargetLog,
    onOpenLogDialog,
    onLogDialogOpenChange,
  } = useTaskDialogState({
    liveTaskId,
    liveTask,
    liveTaskStatus,
    liveTaskLog,
    selectedTaskId,
    selectedTask,
    tasks,
    taskLogs,
    setSelectedTaskId,
    setLogDialogOpen,
  })

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

  useConfigAutosave({
    configLoaded,
    rawOverrideMode,
    rawConfigInput,
    generatedToml,
    configPath,
    lastSavedSignatureRef,
    setIsAutoSavingConfig,
    setConfigPath,
    setMessage,
    t,
    saveConfig,
  })


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
    loadJavaEnvironment()
  }, [])

  useEffect(() => {
    if (!appSettingsOpen) return
    if (appSettingsCleanupTimerRef.current) {
      clearTimeout(appSettingsCleanupTimerRef.current)
      appSettingsCleanupTimerRef.current = null
    }
  }, [appSettingsOpen])

  useEffect(
    () => () => {
      if (appSettingsCleanupTimerRef.current) {
        clearTimeout(appSettingsCleanupTimerRef.current)
        appSettingsCleanupTimerRef.current = null
      }
    },
    [],
  )

  const navItems = [
    { key: NAV_BUILD, label: t("nav.build"), icon: Hammer },
    { key: NAV_ASSETS, label: t("nav.assets"), icon: Database },
    { key: NAV_HISTORY, label: t("nav.history"), icon: Archive },
  ]
  const getPackageIcon = useCallback((packageName) => {
    const key = String(packageName || "")
      .trim()
      .toLowerCase()
    const item = packageMetaMap && typeof packageMetaMap === "object" ? packageMetaMap[key] : null
    if (item && hasText(item.icon)) return normalizePackageIconPath(item.icon)
    return getPackageIconFallback(key)
  }, [packageMetaMap, hasText])
  const onAppSettingsOpenChange = (open) => {
    setAppSettingsOpen(open)
    if (appSettingsCleanupTimerRef.current) {
      clearTimeout(appSettingsCleanupTimerRef.current)
      appSettingsCleanupTimerRef.current = null
    }
    if (!open) {
      appSettingsCleanupTimerRef.current = setTimeout(() => {
        setAppSettingsId("")
        resetAppSettingsState()
        appSettingsCleanupTimerRef.current = null
      }, 180)
    }
  }
  const onOpenAppSettingsDialog = useCallback(
    async (app) => {
      const source = app && typeof app === "object" ? app : null
      if (!source) return

      setAppSettingsId(String(source.id || ""))
      setAppSettingsOpen(true)

      const loaded = await loadConfig({ silent: true })
      const nextApps = Array.isArray(loaded?.nextForm?.apps) ? loaded.nextForm.apps : []
      if (nextApps.length === 0) return
      if (!useDialogStore.getState().appSettingsOpen) return

      const sourcePackage = String(source.packageName || "")
        .trim()
        .toLowerCase()
      const sourceName = String(source.name || "")
        .trim()
        .toLowerCase()

      const matched =
        (sourcePackage
          ? nextApps.find(
              (item) =>
                String(item?.packageName || "")
                  .trim()
                  .toLowerCase() === sourcePackage,
            )
          : null) ||
        (sourceName
          ? nextApps.find(
              (item) =>
                String(item?.name || "")
                  .trim()
                  .toLowerCase() === sourceName,
            )
          : null) ||
        null

      if (matched && hasText(matched.id)) {
        setAppSettingsId(String(matched.id))
      }
    },
    [setAppSettingsId, setAppSettingsOpen, loadConfig, hasText],
  )

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
      onOpenAppSettingsDialog,
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
      onBrowseAppLocalApkPath: () => onBrowseAppLocalApkPath(editingApp),
      updateApp,
      hasText,
      appPatchOptions,
      appVersionOptions,
      appPatchLoadingId,
      appPatchStage,
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
