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
  setMircrogSourceRepoOptions,
  setMircrogSourceRepo,
  lastSavedSignatureRef,
  setConfigLoaded,
  setMessage,
  fetchConfig,
  configFormFromToml,
  mergeRepoOptions,
  defaultEngineSourceRepo,
  defaultPatchesSourceRepo,
  defaultMircrogSourceRepo,
}) {
  const updateEngineSourceRepoOptions = setEngineSourceRepoOptions
  const engineSourceRepoDefault = defaultEngineSourceRepo
  const applyLoadedConfig = useCallback(
    ({ content, resolvedPath, sourceRepoOptions }) => {
      const nextForm = configFormFromToml(content)
      const nextPatchCli = nextForm?.patchCli || {}
      const repoOptions = sourceRepoOptions && typeof sourceRepoOptions === "object" ? sourceRepoOptions : {}
      setConfigPath(resolvedPath)
      setRawConfigInput(content)
      setConfigForm(nextForm)
      setSelectedKeystorePath(String(nextForm?.signing?.keystorePath || "").trim())
      updateEngineSourceRepoOptions(
        mergeRepoOptions(repoOptions?.engine, nextPatchCli?.patchesRepo, engineSourceRepoDefault),
      )
      setPatchesSourceRepoOptions(
        mergeRepoOptions(repoOptions?.patches, nextForm?.patches?.patchesRepo, defaultPatchesSourceRepo),
      )
      const nextMircrogRepoOptions = mergeRepoOptions(repoOptions?.microg, defaultMircrogSourceRepo, defaultMircrogSourceRepo)
      setMircrogSourceRepoOptions(nextMircrogRepoOptions)
      setMircrogSourceRepo(String(nextMircrogRepoOptions[0] || defaultMircrogSourceRepo))
      const sourceRepoSignature = JSON.stringify({
        engine: mergeRepoOptions(repoOptions?.engine, nextPatchCli?.patchesRepo, engineSourceRepoDefault),
        patches: mergeRepoOptions(repoOptions?.patches, nextForm?.patches?.patchesRepo, defaultPatchesSourceRepo),
        microg: nextMircrogRepoOptions,
      })
      lastSavedSignatureRef.current = `${resolvedPath}\n${content}\n${sourceRepoSignature}`
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
      setMircrogSourceRepoOptions,
      setMircrogSourceRepo,
      mergeRepoOptions,
      engineSourceRepoDefault,
      defaultPatchesSourceRepo,
      defaultMircrogSourceRepo,
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
      const sourceRepoOptions = data && typeof data.sourceRepoOptions === "object" ? data.sourceRepoOptions : {}
      const nextForm = applyLoadedConfig({ content, resolvedPath, sourceRepoOptions })
      return { nextForm, resolvedPath, content }
    } catch (error) {
      if (!silent) {
        setMessage(error.message || String(error), "error")
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
      const sourceRepoOptions = data && typeof data.sourceRepoOptions === "object" ? data.sourceRepoOptions : {}
      applyLoadedConfig({ content, resolvedPath, sourceRepoOptions })
      setRawOverrideMode(true)
      setMessage(`Raw reloaded latest config: ${resolvedPath}`)
    } catch (error) {
      setMessage(error.message || String(error), "error")
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
