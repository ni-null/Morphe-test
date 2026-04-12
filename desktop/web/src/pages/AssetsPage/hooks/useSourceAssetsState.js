import { useEffect, useState } from "react"

export default function useSourceAssetsState({
  activeNav,
  navAssetsKey,
  navBuildKey,
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
  defaults,
}) {
  const currentEngineSettingsOpen = Boolean(engineSettingsOpen)
  const currentPatchesSettingsOpen = Boolean(patchBundleSettingsOpen)
  const currentPatchCliCfg = configForm?.patchCli || {}

  const [engineLocalFiles, setEngineLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [keystoreFiles, setKeystoreFiles] = useState([])
  const [selectedKeystorePath, setSelectedKeystorePath] = useState("")
  const [engineDeleteName, setEngineDeleteName] = useState("")
  const [patchesDeleteName, setPatchesDeleteName] = useState("")
  const [engineSourceRepoOptions, setEngineSourceRepoOptions] = useState(() => {
    return [defaults.engineSourceRepo]
  })
  const [engineSourceRepo, setEngineSourceRepo] = useState(defaults.engineSourceRepo)
  const [engineSourceRepoDraft, setEngineSourceRepoDraft] = useState("")
  const [engineSourceVersions, setEngineSourceVersions] = useState([])
  const [engineSourceVersion, setEngineSourceVersion] = useState("")
  const [engineSourceDownloadingNames, setEngineSourceDownloadingNames] = useState([])
  const [patchesSourceRepoOptions, setPatchesSourceRepoOptions] = useState(() => {
    return [defaults.patchesSourceRepo]
  })
  const [patchesSourceRepo, setPatchesSourceRepo] = useState(defaults.patchesSourceRepo)
  const [patchesSourceRepoDraft, setPatchesSourceRepoDraft] = useState("")
  const [patchesSourceVersions, setPatchesSourceVersions] = useState([])
  const [patchesSourceVersion, setPatchesSourceVersion] = useState("")
  const [patchesSourceDownloadingNames, setPatchesSourceDownloadingNames] = useState([])

  async function loadEngineLocalFiles() {
    try {
      const data = await listSourceFiles("engine-cli")
      setEngineLocalFiles(sortFilesByVersion(Array.isArray(data?.files) ? data.files : []))
    } catch (error) {
      setMessage(error.message || String(error))
    }
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

  async function loadEngineSourceVersions(repoOverride = "") {
    const repo = String(repoOverride || engineSourceRepo || "").trim()
    if (!repo) {
      setEngineSourceVersions([])
      setEngineSourceVersion("")
      return
    }
    try {
      const data = await fetchSourceVersions({
        type: "engine-cli",
        repo,
      })
      const versions = dedupeSourceVersions(data?.versions)
      const localFileNameSet = new Set(
        engineLocalFiles
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
      setEngineSourceVersions(versions)
      setEngineSourceVersion(firstUndownloaded ? String(firstUndownloaded.fileName || "") : "")
    } catch (error) {
      setEngineSourceVersions([])
      setEngineSourceVersion("")
      setMessage(error.message || String(error))
    }
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

  async function onAddEngineSourceRepo() {
    const repo = String(engineSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("engine-cli", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(engineSourceRepoOptions, repo, defaults.engineSourceRepo)
    setEngineSourceRepoOptions(nextOptions)
    setEngineSourceRepo(repo)
    loadEngineSourceVersions(repo)
    setEngineSourceRepoDraft("")
    return true
  }

  function onSelectEngineSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(engineSourceRepoOptions, value, defaults.engineSourceRepo)
    setEngineSourceRepoOptions(nextOptions)
    setEngineSourceRepo(repo)
    loadEngineSourceVersions(repo)
  }

  function onDeleteEngineSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === defaults.engineSourceRepo.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      engineSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
      "",
      defaults.engineSourceRepo,
    )
    const currentSelected = String(engineSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || defaults.engineSourceRepo) : currentSelected
    setEngineSourceRepoOptions(nextOptions)
    setEngineSourceRepo(nextRepo)
  }

  async function onAddPatchesSourceRepo() {
    const repo = String(patchesSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("patches", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, repo, defaults.patchesSourceRepo)
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(repo)
    loadPatchesSourceVersions(repo)
    setPatchesSourceRepoDraft("")
    return true
  }

  function onSelectPatchesSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, value, defaults.patchesSourceRepo)
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(repo)
    loadPatchesSourceVersions(repo)
  }

  function onDeletePatchesSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === defaults.patchesSourceRepo.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      patchesSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
      "",
      defaults.patchesSourceRepo,
    )
    const currentSelected = String(patchesSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || defaults.patchesSourceRepo) : currentSelected
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(nextRepo)
  }

  async function onDeleteEngineFile(file) {
    const relativePath = String(file?.relativePath || file?.name || "").trim()
    const fileName = String(file?.name || "").trim()
    if (!relativePath) return
    setEngineDeleteName(relativePath)
    try {
      await deleteSourceFile("engine-cli", relativePath)
      const current = pickSourceFileName(currentPatchCliCfg.path)
      if (current === fileName) {
        updateConfigSection("patchCli", { path: "" })
      }
      await loadEngineLocalFiles()
      setMessage(t("msg.deleted", { name: relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setEngineDeleteName("")
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

  async function onDownloadEngineFromSource(versionOverride = "") {
    const targetVersion = hasText(versionOverride) ? String(versionOverride).trim() : String(engineSourceVersion || "").trim()
    if (!hasText(engineSourceRepo) || !hasText(targetVersion)) return
    setEngineSourceDownloadingNames((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : [])
      next.add(targetVersion)
      return Array.from(next)
    })
    try {
      const data = await fetchAndSaveSource({
        type: "engine-cli",
        mode: "stable",
        patchesRepo: engineSourceRepo,
        version: targetVersion,
      })
      await loadEngineLocalFiles()
      if (hasText(data?.fullPath)) {
        updateConfigSection("patchCli", { path: String(data.fullPath) })
      }
      setEngineSourceVersion("")
      setMessage(t("msg.downloadSaved", { name: data.fileName }))
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setEngineSourceDownloadingNames((prev) =>
        (Array.isArray(prev) ? prev : []).filter((name) => String(name || "").trim() !== targetVersion),
      )
    }
  }

  async function onDownloadPatchesFromSource(versionOverride = "") {
    const targetVersion = hasText(versionOverride) ? String(versionOverride).trim() : String(patchesSourceVersion || "").trim()
    if (!hasText(patchesSourceRepo) || !hasText(targetVersion)) return
    setPatchesSourceDownloadingNames((prev) => {
      const next = new Set(Array.isArray(prev) ? prev : [])
      next.add(targetVersion)
      return Array.from(next)
    })
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
      setPatchesSourceDownloadingNames((prev) =>
        (Array.isArray(prev) ? prev : []).filter((name) => String(name || "").trim() !== targetVersion),
      )
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

  function onChangeKeystoreSelect(value) {
    const selected = String(value || "").trim()
    if (!selected || selected === "__NONE__") return
    setSelectedKeystorePath(selected)
  }

  useEffect(() => {
    if (currentEngineSettingsOpen) {
      const nextOptions = mergeRepoOptions(engineSourceRepoOptions, currentPatchCliCfg?.patchesRepo, defaults.engineSourceRepo)
      const configSelected = String(currentPatchCliCfg?.patchesRepo || "").trim()
      const current = String(engineSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasSelected = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === configSelected.toLowerCase(),
      )
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
      const nextRepo = hasSelected
        ? configSelected
        : hasCurrent
          ? engineSourceRepo
          : String(nextOptions[0] || defaults.engineSourceRepo)
      setEngineSourceRepoOptions(nextOptions)
      setEngineSourceRepo(nextRepo)
      loadEngineLocalFiles()
    }
  }, [currentEngineSettingsOpen])

  useEffect(() => {
    if (currentEngineSettingsOpen) {
      loadEngineSourceVersions()
    }
  }, [currentEngineSettingsOpen, engineSourceRepo])

  useEffect(() => {
    if (currentPatchesSettingsOpen) {
      const configSelected = String(configForm?.patches?.patchesRepo || "").trim()
      const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, configSelected, defaults.patchesSourceRepo)
      const current = String(patchesSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasSelected = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === configSelected.toLowerCase(),
      )
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
      const nextRepo = hasSelected
        ? configSelected
        : hasCurrent
          ? patchesSourceRepo
          : String(nextOptions[0] || defaults.patchesSourceRepo)
      setPatchesSourceRepoOptions(nextOptions)
      setPatchesSourceRepo(nextRepo)
      loadPatchesLocalFiles()
    }
  }, [currentPatchesSettingsOpen])

  useEffect(() => {
    if (currentPatchesSettingsOpen) {
      loadPatchesSourceVersions()
    }
  }, [currentPatchesSettingsOpen, patchesSourceRepo])

  useEffect(() => {
    if (activeNav !== navAssetsKey && activeNav !== navBuildKey) return
    loadEngineLocalFiles()
    loadPatchesLocalFiles()
    loadKeystoreFiles()
    if (activeNav === navBuildKey) return
    loadEngineSourceVersions()
    loadPatchesSourceVersions()
    loadDownloadedApkFiles()
  }, [activeNav])

  return {
    engineLocalFiles: engineLocalFiles,
    patchBundleLocalFiles: patchesLocalFiles,
    engineDeleteName: engineDeleteName,
    patchBundleDeleteName: patchesDeleteName,
    engineSourceRepoOptions: engineSourceRepoOptions,
    patchBundleSourceRepoOptions: patchesSourceRepoOptions,
    engineSourceRepo: engineSourceRepo,
    patchBundleSourceRepo: patchesSourceRepo,
    engineSourceRepoDraft: engineSourceRepoDraft,
    patchBundleSourceRepoDraft: patchesSourceRepoDraft,
    setEngineSourceRepoDraft: setEngineSourceRepoDraft,
    setPatchBundleSourceRepoDraft: setPatchesSourceRepoDraft,
    engineSourceVersions: engineSourceVersions,
    patchBundleSourceVersions: patchesSourceVersions,
    engineSourceVersion: engineSourceVersion,
    patchBundleSourceVersion: patchesSourceVersion,
    setEngineSourceVersion: setEngineSourceVersion,
    setPatchBundleSourceVersion: setPatchesSourceVersion,
    engineSourceDownloadingNames: engineSourceDownloadingNames,
    patchBundleSourceDownloadingNames: patchesSourceDownloadingNames,
    onAddEngineSourceRepo: onAddEngineSourceRepo,
    onSelectEngineSourceRepo: onSelectEngineSourceRepo,
    onDeleteEngineSourceRepo: onDeleteEngineSourceRepo,
    onAddPatchBundleSourceRepo: onAddPatchesSourceRepo,
    onSelectPatchBundleSourceRepo: onSelectPatchesSourceRepo,
    onDeletePatchBundleSourceRepo: onDeletePatchesSourceRepo,
    onDeleteEngineFile: onDeleteEngineFile,
    onDeletePatchBundleFile: onDeletePatchesFile,
    onDownloadEngineFromSource: onDownloadEngineFromSource,
    onDownloadPatchBundleFromSource: onDownloadPatchesFromSource,
    engineLocalFiles,
    patchesLocalFiles,
    keystoreFiles,
    selectedKeystorePath,
    setSelectedKeystorePath,
    engineDeleteName,
    patchesDeleteName,
    engineSourceRepoOptions,
    setEngineSourceRepoOptions,
    engineSourceRepo,
    setEngineSourceRepo,
    engineSourceRepoDraft,
    setEngineSourceRepoDraft,
    engineSourceVersions,
    engineSourceVersion,
    setEngineSourceVersion,
    engineSourceDownloadingNames,
    patchesSourceRepoOptions,
    setPatchesSourceRepoOptions,
    patchesSourceRepo,
    setPatchesSourceRepo,
    patchesSourceRepoDraft,
    setPatchesSourceRepoDraft,
    patchesSourceVersions,
    patchesSourceVersion,
    setPatchesSourceVersion,
    patchesSourceDownloadingNames,
    loadEngineLocalFiles,
    loadPatchesLocalFiles,
    loadKeystoreFiles,
    loadEngineSourceVersions,
    loadPatchesSourceVersions,
    onOpenAssetsDir,
    onAddEngineSourceRepo,
    onSelectEngineSourceRepo,
    onDeleteEngineSourceRepo,
    onAddPatchesSourceRepo,
    onSelectPatchesSourceRepo,
    onDeletePatchesSourceRepo,
    onDeleteEngineFile,
    onDeletePatchesFile,
    onDownloadEngineFromSource,
    onDownloadPatchesFromSource,
    onChangeKeystoreSelect,
  }
}
