import { useEffect } from "react"

export default function useConfigAutosave({
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
  sourceRepoOptions,
}) {
  useEffect(() => {
    if (!configLoaded) return undefined
    const content = rawOverrideMode ? rawConfigInput : generatedToml
    const sourceRepoSignature = JSON.stringify(sourceRepoOptions || {})
    const signature = `${configPath}\n${content}\n${sourceRepoSignature}`
    if (signature === lastSavedSignatureRef.current) {
      return undefined
    }

    const timer = setTimeout(async () => {
      setIsAutoSavingConfig(true)
      try {
        const data = await saveConfig({ path: configPath, content, sourceRepoOptions })
        const resolvedPath = String(data.path || configPath)
        lastSavedSignatureRef.current = `${resolvedPath}\n${content}\n${sourceRepoSignature}`
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
  }, [
    configLoaded,
    rawOverrideMode,
    rawConfigInput,
    generatedToml,
    configPath,
    lastSavedSignatureRef,
    setIsAutoSavingConfig,
    saveConfig,
    sourceRepoOptions,
    setConfigPath,
    setMessage,
    t,
  ])
}
