import { useEffect, useMemo, useState } from "react"

export default function useAppPatchSettingsState({
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
}) {
  const [appVersionOptions, setAppVersionOptions] = useState({})
  const [appPatchOptions, setAppPatchOptions] = useState({})
  const [appUnsupportedPatches, setAppUnsupportedPatches] = useState({})
  const [appPatchLoadingId, setAppPatchLoadingId] = useState("")
  const [appVersionError, setAppVersionError] = useState("")
  const [appPatchError, setAppPatchError] = useState("")

  const editingApp = useMemo(() => configForm.apps.find((app) => app.id === appSettingsId) || null, [configForm.apps, appSettingsId])

  async function loadAppVersions(app) {
    const appId = String(app?.id || "")
    const packageName = String(app?.packageName || "").trim()
    if (!appId || !packageName) {
      setAppVersionError(t("msg.missingPackageForVersion"))
      return
    }
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

  async function onBrowseAppLocalApkPath(app) {
    if (!app || !app.id) return
    try {
      const current = hasText(app.localApkCustomPath) ? app.localApkCustomPath : ""
      const data = await browseLocalApkPath(current)
      if (!data || data.canceled || !hasText(data.path)) return
      updateApp(app.id, { localApkCustomPath: String(data.path) })
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  function resetAppSettingsState() {
    setAppVersionError("")
    setAppPatchError("")
    setAppUnsupportedPatches({})
  }

  useEffect(() => {
    if (!appSettingsOpen || !editingApp) return
    loadAppVersions(editingApp)
    loadAppPatchOptions(editingApp)
  }, [appSettingsOpen, editingApp?.id])

  return {
    editingApp,
    appVersionOptions,
    appPatchOptions,
    appUnsupportedPatches,
    appPatchLoadingId,
    appVersionError,
    appPatchError,
    loadAppPatchOptions,
    onBrowseAppLocalApkPath,
    resetAppSettingsState,
  }
}
