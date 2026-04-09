import { useEffect, useState } from "react"

export default function useSourceAssetsState({
  activeNav,
  navAssetsKey,
  navBuildKey,
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
  storageKeys,
  defaults,
}) {
  const [morpheLocalFiles, setMorpheLocalFiles] = useState([])
  const [patchesLocalFiles, setPatchesLocalFiles] = useState([])
  const [keystoreFiles, setKeystoreFiles] = useState([])
  const [selectedKeystorePath, setSelectedKeystorePath] = useState(() => {
    try {
      return String(globalThis?.localStorage?.getItem(storageKeys.keystoreSelectedPathKey) || "").trim()
    } catch {
      return ""
    }
  })
  const [morpheDeleteName, setMorpheDeleteName] = useState("")
  const [patchesDeleteName, setPatchesDeleteName] = useState("")
  const [morpheSourceRepoOptions, setMorpheSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(storageKeys.morpheSourceReposKey) || "")
      if (!raw) return [defaults.morpheSourceRepo]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, defaults.morpheSourceRepo, defaults.morpheSourceRepo)
    } catch {
      return [defaults.morpheSourceRepo]
    }
  })
  const [morpheSourceRepo, setMorpheSourceRepo] = useState(defaults.morpheSourceRepo)
  const [morpheSourceRepoDraft, setMorpheSourceRepoDraft] = useState("")
  const [morpheSourceVersions, setMorpheSourceVersions] = useState([])
  const [morpheSourceVersion, setMorpheSourceVersion] = useState("")
  const [morpheSourceDownloading, setMorpheSourceDownloading] = useState(false)
  const [patchesSourceRepoOptions, setPatchesSourceRepoOptions] = useState(() => {
    try {
      const raw = String(globalThis?.localStorage?.getItem(storageKeys.patchesSourceReposKey) || "")
      if (!raw) return [defaults.patchesSourceRepo]
      const parsed = JSON.parse(raw)
      return mergeRepoOptions(parsed, defaults.patchesSourceRepo, defaults.patchesSourceRepo)
    } catch {
      return [defaults.patchesSourceRepo]
    }
  })
  const [patchesSourceRepo, setPatchesSourceRepo] = useState(defaults.patchesSourceRepo)
  const [patchesSourceRepoDraft, setPatchesSourceRepoDraft] = useState("")
  const [patchesSourceVersions, setPatchesSourceVersions] = useState([])
  const [patchesSourceVersion, setPatchesSourceVersion] = useState("")
  const [patchesSourceDownloading, setPatchesSourceDownloading] = useState(false)

  async function loadMorpheLocalFiles() {
    try {
      const data = await listSourceFiles("morphe-cli")
      setMorpheLocalFiles(sortFilesByVersion(Array.isArray(data?.files) ? data.files : []))
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

  async function onAddMorpheSourceRepo() {
    const repo = String(morpheSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("morphe-cli", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(morpheSourceRepoOptions, repo, defaults.morpheSourceRepo)
    setMorpheSourceRepoOptions(nextOptions)
    setMorpheSourceRepo(repo)
    updateConfigSection("morpheCli", { repoOptions: nextOptions })
    loadMorpheSourceVersions(repo)
    setMorpheSourceRepoDraft("")
    return true
  }

  function onSelectMorpheSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(morpheSourceRepoOptions, value, defaults.morpheSourceRepo)
    setMorpheSourceRepoOptions(nextOptions)
    updateConfigSection("morpheCli", { repoOptions: nextOptions })
    setMorpheSourceRepo(repo)
    loadMorpheSourceVersions(repo)
  }

  function onDeleteMorpheSourceRepo(value) {
    const target = String(value || "").trim()
    if (!target) return
    if (target.toLowerCase() === defaults.morpheSourceRepo.toLowerCase()) return
    const nextOptions = mergeRepoOptions(
      morpheSourceRepoOptions.filter(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() !== target.toLowerCase(),
      ),
      "",
      defaults.morpheSourceRepo,
    )
    const currentSelected = String(morpheSourceRepo || "").trim()
    const nextRepo = currentSelected.toLowerCase() === target.toLowerCase() ? String(nextOptions[0] || defaults.morpheSourceRepo) : currentSelected
    setMorpheSourceRepoOptions(nextOptions)
    setMorpheSourceRepo(nextRepo)
    updateConfigSection("morpheCli", {
      repoOptions: nextOptions,
    })
  }

  async function onAddPatchesSourceRepo() {
    const repo = String(patchesSourceRepoDraft || "").trim()
    if (!repo) return false
    const exists = await validateSourceRepoExists("patches", repo)
    if (!exists) return false
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, repo, defaults.patchesSourceRepo)
    setPatchesSourceRepoOptions(nextOptions)
    setPatchesSourceRepo(repo)
    updateConfigSection("patches", { repoOptions: nextOptions })
    loadPatchesSourceVersions(repo)
    setPatchesSourceRepoDraft("")
    return true
  }

  function onSelectPatchesSourceRepo(value) {
    const repo = String(value || "").trim()
    const nextOptions = mergeRepoOptions(patchesSourceRepoOptions, value, defaults.patchesSourceRepo)
    setPatchesSourceRepoOptions(nextOptions)
    updateConfigSection("patches", { repoOptions: nextOptions })
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
    updateConfigSection("patches", {
      repoOptions: nextOptions,
    })
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
    localStorage.setItem(storageKeys.morpheSourceReposKey, JSON.stringify(morpheSourceRepoOptions))
  }, [morpheSourceRepoOptions, storageKeys.morpheSourceReposKey])

  useEffect(() => {
    localStorage.setItem(storageKeys.patchesSourceReposKey, JSON.stringify(patchesSourceRepoOptions))
  }, [patchesSourceRepoOptions, storageKeys.patchesSourceReposKey])

  useEffect(() => {
    if (!hasText(selectedKeystorePath)) {
      localStorage.removeItem(storageKeys.keystoreSelectedPathKey)
      return
    }
    localStorage.setItem(storageKeys.keystoreSelectedPathKey, selectedKeystorePath)
  }, [selectedKeystorePath, hasText, storageKeys.keystoreSelectedPathKey])

  useEffect(() => {
    if (morpheSettingsOpen) {
      const nextOptions = mergeRepoOptions(configForm?.morpheCli?.repoOptions, "", defaults.morpheSourceRepo)
      const current = String(morpheSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
      const nextRepo = hasCurrent ? morpheSourceRepo : String(nextOptions[0] || defaults.morpheSourceRepo)
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
      const nextOptions = mergeRepoOptions(configForm?.patches?.repoOptions, "", defaults.patchesSourceRepo)
      const current = String(patchesSourceRepo || "")
        .trim()
        .toLowerCase()
      const hasCurrent = nextOptions.some(
        (item) =>
          String(item || "")
            .trim()
            .toLowerCase() === current,
      )
      const nextRepo = hasCurrent ? patchesSourceRepo : String(nextOptions[0] || defaults.patchesSourceRepo)
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
    if (activeNav !== navAssetsKey && activeNav !== navBuildKey) return
    loadMorpheLocalFiles()
    loadPatchesLocalFiles()
    loadKeystoreFiles()
    if (activeNav === navBuildKey) return
    loadMorpheSourceVersions()
    loadPatchesSourceVersions()
    loadDownloadedApkFiles()
  }, [activeNav])

  return {
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
    loadMorpheLocalFiles,
    loadPatchesLocalFiles,
    loadKeystoreFiles,
    loadMorpheSourceVersions,
    loadPatchesSourceVersions,
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
  }
}
