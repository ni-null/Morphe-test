import { useCallback } from "react"

export default function useConfigLifecycle({
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
  defaultMorpheSourceRepo,
  defaultPatchesSourceRepo,
}) {
  const applyLoadedConfig = useCallback(
    ({ content, resolvedPath }) => {
      const nextForm = configFormFromToml(content)
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(nextForm)
      setSelectedKeystorePath(String(nextForm?.signing?.keystorePath || "").trim())
      setMorpheSourceRepoOptions(
        mergeRepoOptions(nextForm?.morpheCli?.repoOptions, nextForm?.morpheCli?.patchesRepo, defaultMorpheSourceRepo),
      )
      setPatchesSourceRepoOptions(
        mergeRepoOptions(nextForm?.patches?.repoOptions, nextForm?.patches?.patchesRepo, defaultPatchesSourceRepo),
      )
      lastSavedSignatureRef.current = `${resolvedPath}\n${content}`
      setConfigLoaded(true)
      return nextForm
    },
    [
      configFormFromToml,
      setConfigPath,
      setRawConfigInput,
      setConfigForm,
      setSelectedKeystorePath,
      setMorpheSourceRepoOptions,
      setPatchesSourceRepoOptions,
      mergeRepoOptions,
      defaultMorpheSourceRepo,
      defaultPatchesSourceRepo,
      lastSavedSignatureRef,
      setConfigLoaded,
    ],
  )

  const loadConfig = useCallback(async () => {
    setIsBusy(true)
    try {
      const data = await fetchConfig(configPath)
      const content = String(data.content || "")
      const resolvedPath = String(data.path || configPath)
      applyLoadedConfig({ content, resolvedPath })
      setMessage(`Config loaded: ${resolvedPath}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
    }
  }, [setIsBusy, fetchConfig, configPath, applyLoadedConfig, setMessage])

  const onToggleRawMode = useCallback(async () => {
    if (rawOverrideMode) {
      setRawOverrideMode(false)
      return
    }
    setIsBusy(true)
    try {
      const data = await fetchConfig(configPath)
      const content = String(data.content || "")
      const resolvedPath = String(data.path || configPath)
      applyLoadedConfig({ content, resolvedPath })
      setRawOverrideMode(true)
      setMessage(`Raw reloaded latest config: ${resolvedPath}`)
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
    }
  }, [rawOverrideMode, setRawOverrideMode, setIsBusy, fetchConfig, configPath, applyLoadedConfig, setMessage])

  return {
    loadConfig,
    onToggleRawMode,
    applyLoadedConfig,
  }
}
