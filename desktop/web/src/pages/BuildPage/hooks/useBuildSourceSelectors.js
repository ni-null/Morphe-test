import { useMemo } from "react"

export default function useBuildSourceSelectors({
  configForm,
  morpheLocalFiles,
  patchesLocalFiles,
  keystoreFiles,
  selectedKeystorePath,
  hasText,
  updateConfigSection,
  extractSourceFolderLabel,
  morpheRemoteStableValue,
  morpheRemoteDevValue,
  patchesRemoteStableValue,
  patchesRemoteDevValue,
  onChangeKeystoreSelect,
}) {
  const morpheCliSelectOptions = useMemo(() => {
    const options = [
      { value: morpheRemoteStableValue, label: "latest stable (MorpheApp/morphe-cli)", kind: "remote-stable" },
      { value: morpheRemoteDevValue, label: "latest dev (MorpheApp/morphe-cli)", kind: "remote-dev" },
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
  }, [morpheLocalFiles, morpheRemoteStableValue, morpheRemoteDevValue, extractSourceFolderLabel, hasText])

  const morpheCliSelectValue = useMemo(() => {
    const mode = String(configForm?.morpheCli?.mode || "stable").trim().toLowerCase()
    if (mode === "dev") return morpheRemoteDevValue
    if (mode === "stable") return morpheRemoteStableValue
    const localValue = String(configForm?.morpheCli?.path || "").trim()
    if (localValue && morpheCliSelectOptions.some((item) => item.value === localValue)) return localValue
    return morpheRemoteStableValue
  }, [configForm?.morpheCli?.mode, configForm?.morpheCli?.path, morpheCliSelectOptions, morpheRemoteDevValue, morpheRemoteStableValue])

  function onChangeMorpheCliSelect(value) {
    const selected = String(value || "").trim()
    if (!selected) return
    if (selected === morpheRemoteStableValue) {
      updateConfigSection("morpheCli", { mode: "stable" })
      return
    }
    if (selected === morpheRemoteDevValue) {
      updateConfigSection("morpheCli", { mode: "dev" })
      return
    }
    updateConfigSection("morpheCli", { mode: "local", path: selected })
  }

  const patchesSelectOptions = useMemo(() => {
    const options = [
      { value: patchesRemoteStableValue, label: "latest stable (MorpheApp/morphe-patches)", kind: "remote-stable" },
      { value: patchesRemoteDevValue, label: "latest dev (MorpheApp/morphe-patches)", kind: "remote-dev" },
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
  }, [patchesLocalFiles, patchesRemoteStableValue, patchesRemoteDevValue, extractSourceFolderLabel, hasText])

  const patchesSelectValue = useMemo(() => {
    const mode = String(configForm?.patches?.mode || "stable").trim().toLowerCase()
    if (mode === "dev") return patchesRemoteDevValue
    if (mode === "stable") return patchesRemoteStableValue
    const localValue = String(configForm?.patches?.path || "").trim()
    if (localValue && patchesSelectOptions.some((item) => item.value === localValue)) return localValue
    return patchesRemoteStableValue
  }, [configForm?.patches?.mode, configForm?.patches?.path, patchesSelectOptions, patchesRemoteDevValue, patchesRemoteStableValue])

  function onChangePatchesSelect(value) {
    const selected = String(value || "").trim()
    if (!selected) return
    if (selected === patchesRemoteStableValue) {
      updateConfigSection("patches", { mode: "stable" })
      return
    }
    if (selected === patchesRemoteDevValue) {
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
  }, [keystoreFiles, extractSourceFolderLabel, hasText])

  const keystoreSelectValue = useMemo(() => {
    const selected = String(selectedKeystorePath || "").trim()
    if (selected && keystoreSelectOptions.some((item) => item.value === selected)) {
      return selected
    }
    const first = String(keystoreSelectOptions[0]?.value || "").trim()
    return first || "__NONE__"
  }, [selectedKeystorePath, keystoreSelectOptions])

  return {
    morpheCliSelectOptions,
    morpheCliSelectValue,
    onChangeMorpheCliSelect,
    patchesSelectOptions,
    patchesSelectValue,
    onChangePatchesSelect,
    keystoreSelectOptions,
    keystoreSelectValue,
    onChangeKeystoreSelect,
  }
}
