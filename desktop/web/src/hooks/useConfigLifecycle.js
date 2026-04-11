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
  setEngineSourceRepoOptions,
  setPatchesSourceRepoOptions,
  lastSavedSignatureRef,
  setConfigLoaded,
  setMessage,
  fetchConfig,
  configFormFromToml,
  mergeRepoOptions,
  defaultEngineSourceRepo,
  defaultPatchesSourceRepo,
}) {
  const updateEngineSourceRepoOptions = setEngineSourceRepoOptions
  const engineSourceRepoDefault = defaultEngineSourceRepo
  const applyLoadedConfig = useCallback(
    ({ content, resolvedPath }) => {
      const nextForm = configFormFromToml(content)
      const nextPatchCli = nextForm?.patchCli || {}
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(nextForm)
      setSelectedKeystorePath(String(nextForm?.signing?.keystorePath || "").trim())
      updateEngineSourceRepoOptions(
        mergeRepoOptions(nextPatchCli?.repoOptions, nextPatchCli?.patchesRepo, engineSourceRepoDefault),
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
      updateEngineSourceRepoOptions,
      setPatchesSourceRepoOptions,
      mergeRepoOptions,
      engineSourceRepoDefault,
      defaultPatchesSourceRepo,
      lastSavedSignatureRef,
      setConfigLoaded,
    ],
  )

  const loadConfig = useCallback(async (options = {}) => {
    const silent = options && options.silent === true
    setIsBusy(true)
    try {
      const data = await fetchConfig(configPath)
      const content = String(data.content || "")
      const resolvedPath = String(data.path || configPath)
      const nextForm = applyLoadedConfig({ content, resolvedPath })
      if (!silent) {
        setMessage(`Config loaded: ${resolvedPath}`)
      }
      return { nextForm, resolvedPath, content }
    } catch (error) {
      if (!silent) {
        setMessage(error.message || String(error))
      }
      return null
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
