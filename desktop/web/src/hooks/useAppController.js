import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Database, Download, Hammer, KeyRound } from "lucide-react"
import {
  fetchConfig,
  fetchPackageMap,
  fetchUiState,
  saveUiState,
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
  openSourceFile,
  importKeystore,
  importSourceFile,
  generateKeystore,
  fetchKeystorePreview,
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
  DEFAULT_ENGINE_SOURCE_REPO,
  DEFAULT_PATCH_BUNDLE_SOURCE_REPO,
  DEFAULT_MICROG_SOURCE_REPO,
  APP_VER_AUTO_VALUE,
  ENGINE_REMOTE_STABLE_VALUE,
  ENGINE_REMOTE_DEV_VALUE,
  PATCH_BUNDLE_REMOTE_STABLE_VALUE,
  PATCH_BUNDLE_REMOTE_DEV_VALUE,
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
export const NAV_MIRCROG = "mircrog"
export const NAV_HISTORY = "history"
export const NAV_ASSETS = "assets"
export const NAV_KEYSTORE = "keystore"

function hasKeystoreExtension(fileName) {
  const name = String(fileName || "").trim().toLowerCase()
  return name.endsWith(".keystore")
}

function detectImportSourceTypeByName(fileName) {
  const name = String(fileName || "").trim().toLowerCase()
  if (name.endsWith(".jar")) return "engine-cli"
  if (name.endsWith(".mpp")) return "patches"
  return ""
}

async function browserFileToBase64(file) {
  const input = file && typeof file === "object" ? file : null
  if (!input) throw new Error("Invalid file.")
  const buffer = await input.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

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
  const engineSettingsOpen = useDialogStore((state) => state.engineSettingsOpen)
  const setEngineSettingsOpen = useDialogStore((state) => state.setEngineSettingsOpen)
  const patchBundleSettingsOpen = useDialogStore((state) => state.patchBundleSettingsOpen)
  const setPatchBundleSettingsOpen = useDialogStore((state) => state.setPatchBundleSettingsOpen)
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
  const [mircrogVersions, setMircrogVersions] = useState([])
  const [mircrogLocalFiles, setMircrogLocalFiles] = useState([])
  const [mircrogLoading, setMircrogLoading] = useState(false)
  const [mircrogSourceRepoOptions, setMircrogSourceRepoOptions] = useState(() => {
    return [DEFAULT_MICROG_SOURCE_REPO]
  })
  const [mircrogSourceRepo, setMircrogSourceRepo] = useState(DEFAULT_MICROG_SOURCE_REPO)
  const [mircrogSourceRepoDraft, setMircrogSourceRepoDraft] = useState("")
  const [mircrogSourceVersion, setMircrogSourceVersion] = useState("")
  const [mircrogDownloadingNames, setMircrogDownloadingNames] = useState([])
  const [mircrogDeleteName, setMircrogDeleteName] = useState("")
  const [keystoreImporting, setKeystoreImporting] = useState(false)
  const [keystoreGenerating, setKeystoreGenerating] = useState(false)
  const [keystoreDeleteName, setKeystoreDeleteName] = useState("")
  const [keystoreViewing, setKeystoreViewing] = useState("")
  const [keystorePreviewOpen, setKeystorePreviewOpen] = useState(false)
  const [keystorePreviewData, setKeystorePreviewData] = useState(null)
  const [assetsImporting, setAssetsImporting] = useState(false)

  const [isBusy, setIsBusy] = useState(false)
  const [message, setSidebarMessage] = useState(null)
  const t = useCallback((key, vars = {}) => translate(locale, key, vars), [locale])
  const setMessage = useCallback((value, type = "success") => {
    const text = String(value ?? "").trim()
    if (text) {
      console.log(text)
    }
    if (!text) {
      setSidebarMessage(null)
      return
    }
    const level = String(type || "success").trim().toLowerCase() === "error" ? "error" : "success"
    setSidebarMessage({
      type: level,
      text,
      at: Date.now(),
    })
  }, [])
  const clearMessage = useCallback(() => {
    setSidebarMessage(null)
  }, [])
  const lastSavedSignatureRef = useRef("")
  const appSettingsCleanupTimerRef = useRef(null)
  const uiStateHydratedRef = useRef(false)

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
  })

  const {
    engineLocalFiles,
    patchBundleLocalFiles,
    engineDeleteName,
    patchBundleDeleteName,
    engineSourceRepoOptions,
    patchBundleSourceRepoOptions,
    engineSourceRepo,
    patchBundleSourceRepo,
    engineSourceRepoDraft,
    patchBundleSourceRepoDraft,
    setEngineSourceRepoDraft,
    setPatchBundleSourceRepoDraft,
    engineSourceVersions,
    patchBundleSourceVersions,
    engineSourceVersion,
    patchBundleSourceVersion,
    setEngineSourceVersion,
    setPatchBundleSourceVersion,
    engineSourceDownloadingNames,
    patchBundleSourceDownloadingNames,
    onAddEngineSourceRepo,
    onSelectEngineSourceRepo,
    onDeleteEngineSourceRepo,
    onAddPatchBundleSourceRepo,
    onSelectPatchBundleSourceRepo,
    onDeletePatchBundleSourceRepo,
    onDeleteEngineFile,
    onDeletePatchBundleFile,
    onDownloadEngineFromSource,
    onDownloadPatchBundleFromSource,
    keystoreFiles,
    selectedKeystorePath,
    setSelectedKeystorePath,
    setEngineSourceRepoOptions,
    setPatchesSourceRepoOptions,
    loadEngineLocalFiles,
    loadPatchesLocalFiles,
    loadKeystoreFiles,
    onOpenAssetsDir,
    onChangeKeystoreSelect,
  } = useSourceAssetsState({
    activeNav,
    navAssetsKey: NAV_ASSETS,
    navBuildKey: NAV_BUILD,
    engineSettingsOpen,
    patchBundleSettingsOpen,
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
    defaults: {
      engineSourceRepo: DEFAULT_ENGINE_SOURCE_REPO,
      patchesSourceRepo: DEFAULT_PATCH_BUNDLE_SOURCE_REPO,
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
    setEngineSourceRepoOptions: setEngineSourceRepoOptions,
    setPatchesSourceRepoOptions,
    setMircrogSourceRepoOptions,
    setMircrogSourceRepo,
    lastSavedSignatureRef,
    setConfigLoaded,
    setMessage,
    fetchConfig,
    configFormFromToml,
    mergeRepoOptions,
    defaultEngineSourceRepo: DEFAULT_ENGINE_SOURCE_REPO,
    defaultPatchesSourceRepo: DEFAULT_PATCH_BUNDLE_SOURCE_REPO,
    defaultMircrogSourceRepo: DEFAULT_MICROG_SOURCE_REPO,
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
    engineSelectOptions,
    engineSelectValue,
    onChangeEngineSelect,
    patchBundleSelectOptions,
    patchBundleSelectValue,
    onChangePatchBundleSelect,
    patchesSelectOptions,
    patchesSelectValue,
    onChangePatchesSelect,
    keystoreSelectOptions,
    keystoreSelectValue,
  } = useBuildSourceSelectors({
    configForm,
    engineLocalFiles: engineLocalFiles,
    patchesLocalFiles: patchBundleLocalFiles,
    keystoreFiles,
    selectedKeystorePath,
    hasText,
    updateConfigSection,
    extractSourceFolderLabel,
    engineRemoteStableValue: ENGINE_REMOTE_STABLE_VALUE,
    engineRemoteDevValue: ENGINE_REMOTE_DEV_VALUE,
    patchesRemoteStableValue: PATCH_BUNDLE_REMOTE_STABLE_VALUE,
    patchesRemoteDevValue: PATCH_BUNDLE_REMOTE_DEV_VALUE,
    onChangeKeystoreSelect,
  })

  const {
    dialogTargetTaskId,
    dialogTargetStatus,
    dialogTargetProviderId,
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
    setConfigForm((prev) => {
      return {
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          ...patch,
        },
      }
    })
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
      setMessage(error.message || String(error), "error")
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
      setMessage(error.message || String(error), "error")
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

  async function loadMircrogVersions(repoOverride = "") {
    setMircrogLoading(true)
    try {
      const repo = String(repoOverride || mircrogSourceRepo || "").trim()
      if (!repo) {
        setMircrogVersions([])
        setMircrogSourceVersion("")
        return
      }
      const [remoteData, localData] = await Promise.all([
        fetchSourceVersions({ type: "microg", repo }),
        listSourceFiles("microg"),
      ])
      const versions = dedupeSourceVersions(remoteData?.versions)
      const localFiles = sortFilesByVersion(Array.isArray(localData?.files) ? localData.files : [])
      const repoDir = repo.replace(/\//g, "@").toLowerCase()
      const localFileNameSet = new Set(
        localFiles
          .filter((file) => String(file?.relativePath || "").trim().replace(/\\/g, "/").toLowerCase().startsWith(`${repoDir}/`))
          .map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase())
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
      setMircrogVersions(versions)
      setMircrogSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
      setMircrogLocalFiles(localFiles)
    } catch (error) {
      setMircrogVersions([])
      setMircrogSourceVersion("")
      setMessage(error.message || String(error), "error")
    } finally {
      setMircrogLoading(false)
    }
  }

  async function onAddMircrogSourceRepo() {
    const repo = String(mircrogSourceRepoDraft || "").trim()
    if (!repo) return false
    try {
      await fetchSourceVersions({ type: "microg", repo })
    } catch (error) {
      setMessage(error.message || String(error), "error")
      return false
    }
    const nextOptions = mergeRepoOptions(mircrogSourceRepoOptions, repo, DEFAULT_MICROG_SOURCE_REPO)
    setMircrogSourceRepoOptions(nextOptions)
    setMircrogSourceRepo(repo)
    setMircrogSourceRepoDraft("")
    await loadMircrogVersions(repo)
    return true
  }

  function onSelectMircrogSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(mircrogSourceRepoOptions, repo, DEFAULT_MICROG_SOURCE_REPO)
    setMircrogSourceRepoOptions(nextOptions)
    setMircrogSourceRepo(repo)
    loadMircrogVersions(repo)
  }

  function onDeleteMircrogSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === DEFAULT_MICROG_SOURCE_REPO.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      mircrogSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
      "",
      DEFAULT_MICROG_SOURCE_REPO,
    )
    const currentSelected = String(mircrogSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || DEFAULT_MICROG_SOURCE_REPO) : currentSelected
    setMircrogSourceRepoOptions(nextOptions)
    setMircrogSourceRepo(nextRepo)
    loadMircrogVersions(nextRepo)
  }

  async function onDownloadMircrogFile(fileName) {
    const targetName = String(fileName || mircrogSourceVersion || "").trim()
    if (!targetName) return
    setMircrogDownloadingNames((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : [])
      next.add(targetName)
      return Array.from(next)
    })
    try {
      const data = await fetchAndSaveSource({
        type: "microg",
        repo: mircrogSourceRepo,
        version: targetName,
      })
      setMessage(t("msg.downloadSaved", { name: data?.fileName || targetName }))
      setMircrogSourceVersion("")
      await loadMircrogVersions(mircrogSourceRepo)
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setMircrogDownloadingNames((prev) =>
        (Array.isArray(prev) ? prev : []).filter((name) => String(name || "").trim() !== targetName),
      )
    }
  }

  async function onDeleteMircrogFile(file) {
    const relativePath = String(file?.relativePath || file?.name || "").trim()
    if (!relativePath) return
    setMircrogDeleteName(relativePath)
    try {
      await deleteSourceFile("microg", relativePath)
      await loadMircrogVersions(mircrogSourceRepo)
      setMessage(t("msg.deleted", { name: relativePath }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setMircrogDeleteName("")
    }
  }

  async function onOpenSourceFile(type, file) {
    const sourceType = String(type || "").trim()
    const relativePath = String(file?.relativePath || "").trim()
    if (!sourceType || !relativePath) return
    try {
      await openSourceFile(sourceType, relativePath)
    } catch (error) {
      setMessage(error.message || String(error), "error")
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
      setMessage(error.message || String(error), "error")
    } finally {
      setApkDeletePath("")
    }
  }

  async function onImportKeystoreFiles(fileList) {
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList || [])
    if (files.length === 0) return
    setKeystoreImporting(true)
    try {
      let importedCount = 0
      for (const file of files) {
        if (!file) continue
        const originalName = String(file?.name || "").trim()
        if (!hasKeystoreExtension(originalName)) {
          throw new Error(t("keystore.invalidExtension", { name: originalName || t("keystore.unknownFile") }))
        }
        const base64 = await browserFileToBase64(file)
        await importKeystore(originalName, base64)
        importedCount += 1
      }
      await loadKeystoreFiles()
      setMessage(t("keystore.imported", { count: importedCount }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setKeystoreImporting(false)
    }
  }

  async function onImportAssetSourceFiles(fileList) {
    const files = Array.isArray(fileList) ? fileList : Array.from(fileList || [])
    if (files.length === 0) return
    setAssetsImporting(true)
    try {
      let importedEngineCount = 0
      let importedPatchesCount = 0
      for (const file of files) {
        if (!file) continue
        const originalName = String(file?.name || "").trim()
        const sourceType = detectImportSourceTypeByName(originalName)
        if (!sourceType) {
          throw new Error(t("assets.invalidImportExt", { name: originalName || t("keystore.unknownFile") }))
        }
        const base64 = await browserFileToBase64(file)
        await importSourceFile(sourceType, originalName, base64)
        if (sourceType === "engine-cli") importedEngineCount += 1
        if (sourceType === "patches") importedPatchesCount += 1
      }
      await Promise.all([loadEngineLocalFiles(), loadPatchesLocalFiles()])
      setMessage(t("assets.imported", { engine: importedEngineCount, patches: importedPatchesCount }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setAssetsImporting(false)
    }
  }

  async function onGenerateKeystore() {
    setKeystoreGenerating(true)
    try {
      const generatedName = `generated-${Date.now()}.keystore`
      const data = await generateKeystore({ fileName: generatedName })
      await loadKeystoreFiles()
      setMessage(t("keystore.generated", { name: String(data?.fileName || generatedName) }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setKeystoreGenerating(false)
    }
  }

  async function onViewKeystoreFile(file) {
    const relativePath = String(file?.relativePath || "").trim()
    if (!relativePath) return
    setKeystoreViewing(relativePath)
    try {
      const preview = await fetchKeystorePreview(relativePath)
      setKeystorePreviewData(preview)
      setKeystorePreviewOpen(true)
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setKeystoreViewing("")
    }
  }

  async function onDeleteKeystoreFile(file) {
    const relativePath = String(file?.relativePath || file?.name || "").trim()
    if (!relativePath) return
    setKeystoreDeleteName(relativePath)
    try {
      await deleteSourceFile("keystore", relativePath)
      await loadKeystoreFiles()
      setMessage(t("msg.deleted", { name: relativePath }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setKeystoreDeleteName("")
    }
  }

  useEffect(() => {
    loadConfig()
    refreshTasks()
  }, [])

  useEffect(() => {
    let canceled = false
    fetchUiState()
      .then((data) => {
        if (canceled) return
        const state = data && typeof data.state === "object" ? data.state : {}
        setLocale(state?.locale)
        setTheme(state?.theme)
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) {
          uiStateHydratedRef.current = true
        }
      })
    return () => {
      canceled = true
    }
  }, [setLocale, setTheme])

  useEffect(() => {
    if (!uiStateHydratedRef.current) return
    saveUiState({ locale, theme }).catch(() => {})
  }, [locale, theme])

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
    sourceRepoOptions: {
      engine: engineSourceRepoOptions,
      patches: patchBundleSourceRepoOptions,
      microg: mircrogSourceRepoOptions,
    },
  })


  async function onConfirmDialogAction() {
    const action = String(confirmDialog.action || "")
    const payload = confirmDialog.payload
    if (!action) return
    setConfirmDialogBusy(true)
    try {
      if (action === "delete-engine-file") {
        await onDeleteEngineFile(payload)
      } else if (action === "delete-patches-file") {
        await onDeletePatchBundleFile(payload)
      } else if (action === "delete-apk-file") {
        await onDeleteDownloadedApkFile(payload)
      } else if (action === "delete-microg-file") {
        await onDeleteMircrogFile(payload)
      } else if (action === "delete-keystore-file") {
        await onDeleteKeystoreFile(payload)
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
    if (activeNav !== NAV_MIRCROG) return
    loadMircrogVersions()
  }, [activeNav])

  useEffect(() => {
    if (activeNav !== NAV_KEYSTORE) return
    loadKeystoreFiles()
  }, [activeNav])

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
    { key: NAV_MIRCROG, label: t("nav.mircrog"), icon: Download },
    { key: NAV_ASSETS, label: t("nav.assets"), icon: Database },
    { key: NAV_KEYSTORE, label: t("nav.keystore"), icon: KeyRound },
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

  const assetsLegacyAliasProps = {
    engineSourceRepo: engineSourceRepo,
    engineSourceRepoOptions: engineSourceRepoOptions,
    engineSourceRepoDraft: engineSourceRepoDraft,
    setEngineSourceRepoDraft: setEngineSourceRepoDraft,
    onSelectEngineSourceRepo: onSelectEngineSourceRepo,
    onAddEngineSourceRepo: onAddEngineSourceRepo,
    onDeleteEngineSourceRepo: onDeleteEngineSourceRepo,
    engineSourceVersion: engineSourceVersion,
    setEngineSourceVersion: setEngineSourceVersion,
    engineSourceVersions: engineSourceVersions,
    onDownloadEngineFromSource: onDownloadEngineFromSource,
    engineSourceDownloadingNames: engineSourceDownloadingNames,
    engineLocalFiles: engineLocalFiles,
    engineDeleteName: engineDeleteName,
    patchesSourceRepo: patchBundleSourceRepo,
    patchesSourceRepoOptions: patchBundleSourceRepoOptions,
    patchesSourceRepoDraft: patchBundleSourceRepoDraft,
    setPatchesSourceRepoDraft: setPatchBundleSourceRepoDraft,
    onSelectPatchesSourceRepo: onSelectPatchBundleSourceRepo,
    onAddPatchesSourceRepo: onAddPatchBundleSourceRepo,
    onDeletePatchesSourceRepo: onDeletePatchBundleSourceRepo,
    patchesSourceVersion: patchBundleSourceVersion,
    setPatchesSourceVersion: setPatchBundleSourceVersion,
    patchesSourceVersions: patchBundleSourceVersions,
    onDownloadPatchesFromSource: onDownloadPatchBundleFromSource,
    patchesSourceDownloadingNames: patchBundleSourceDownloadingNames,
    patchesLocalFiles: patchBundleLocalFiles,
    patchesDeleteName: patchBundleDeleteName,
  }

  const engineSettingsDialogSharedProps = {
    open: engineSettingsOpen,
    onOpenChange: setEngineSettingsOpen,
    t,
    configForm,
    engineLocalFiles,
    engineRemoteStableValue: ENGINE_REMOTE_STABLE_VALUE,
    engineRemoteDevValue: ENGINE_REMOTE_DEV_VALUE,
    updateConfigSection,
    formatBytes,
    openConfirmDialog,
    engineDeleteName,
  }

  const patchBundleSettingsDialogSharedProps = {
    open: patchBundleSettingsOpen,
    onOpenChange: setPatchBundleSettingsOpen,
    t,
    configForm,
    patchBundleLocalFiles,
    patchBundleRemoteStableValue: PATCH_BUNDLE_REMOTE_STABLE_VALUE,
    patchBundleRemoteDevValue: PATCH_BUNDLE_REMOTE_DEV_VALUE,
    updateConfigSection,
    formatBytes,
    openConfirmDialog,
    patchBundleDeleteName,
  }

  return {
    t,
    locale,
    setLocale,
    theme,
    setTheme,
    message,
    clearMessage,
    javaEnv,
    hasText,
    activeNav,
    setActiveNav,
    navItems,
    navKeys: {
      build: NAV_BUILD,
      mircrog: NAV_MIRCROG,
      assets: NAV_ASSETS,
      keystore: NAV_KEYSTORE,
      history: NAV_HISTORY,
    },
    mircrogPageProps: {
      t,
      hasText,
      formatBytes,
      loading: mircrogLoading,
      repo: mircrogSourceRepo,
      repoOptions: mircrogSourceRepoOptions,
      repoDraft: mircrogSourceRepoDraft,
      setRepoDraft: setMircrogSourceRepoDraft,
      sourceVersion: mircrogSourceVersion,
      setSourceVersion: setMircrogSourceVersion,
      versions: mircrogVersions,
      localFiles: mircrogLocalFiles,
      downloadingNames: mircrogDownloadingNames,
      onRefresh: loadMircrogVersions,
      onDownload: onDownloadMircrogFile,
      onSelectRepo: onSelectMircrogSourceRepo,
      onAddRepo: onAddMircrogSourceRepo,
      onDeleteRepo: onDeleteMircrogSourceRepo,
      openConfirmDialog,
      mircrogDeleteName,
      onOpenSourceFile,
      onOpenAssetsDir,
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
      engineSelectValue,
      engineSelectOptions,
      onChangeEngineSelect,
      patchBundleSelectValue,
      patchBundleSelectOptions,
      onChangePatchBundleSelect,
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
      engineSourceRepo,
      engineSourceRepoOptions,
      engineSourceRepoDraft,
      setEngineSourceRepoDraft,
      onSelectEngineSourceRepo,
      onAddEngineSourceRepo,
      onDeleteEngineSourceRepo,
      engineSourceVersion,
      setEngineSourceVersion,
      engineSourceVersions,
      onDownloadEngineFromSource,
      engineSourceDownloadingNames,
      engineLocalFiles,
      engineDeleteName,
      patchBundleSourceRepo,
      patchBundleSourceRepoOptions,
      patchBundleSourceRepoDraft,
      setPatchBundleSourceRepoDraft,
      onSelectPatchBundleSourceRepo,
      onAddPatchBundleSourceRepo,
      onDeletePatchBundleSourceRepo,
      patchBundleSourceVersion,
      setPatchBundleSourceVersion,
      patchBundleSourceVersions,
      onDownloadPatchBundleFromSource,
      patchBundleSourceDownloadingNames,
      patchBundleLocalFiles,
      patchBundleDeleteName,
      openConfirmDialog,
      ...assetsLegacyAliasProps,
      downloadedApkFiles,
      onOpenSourceFile,
      onOpenAssetsDir,
      apkDeletePath,
      assetsImporting,
      onImportAssetSourceFiles,
    },
    keystorePageProps: {
      t,
      hasText,
      formatBytes,
      keystoreFiles,
      keystoreDeleteName,
      keystoreImporting,
      keystoreGenerating,
      keystoreViewing,
      keystorePreviewOpen,
      keystorePreviewData,
      onKeystorePreviewOpenChange: setKeystorePreviewOpen,
      onImportKeystoreFiles,
      onGenerateKeystore,
      onViewKeystoreFile,
      openConfirmDialog,
      onOpenAssetsDir,
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
      taskProviderId: dialogTargetProviderId,
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
    engineSettingsDialogProps: engineSettingsDialogSharedProps,
    patchBundleSettingsDialogProps: patchBundleSettingsDialogSharedProps,
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
