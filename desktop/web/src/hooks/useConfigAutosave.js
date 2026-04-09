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
}) {
  useEffect(() => {
    if (!configLoaded) return undefined
    const content = rawOverrideMode ? rawConfigInput : generatedToml
    const signature = `${configPath}\n${content}`
    if (signature === lastSavedSignatureRef.current) {
      return undefined
    }

    const timer = setTimeout(async () => {
      setIsAutoSavingConfig(true)
      try {
        const data = await saveConfig({ path: configPath, content })
        const resolvedPath = String(data.path || configPath)
        lastSavedSignatureRef.current = `${resolvedPath}\n${content}`
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
    setConfigPath,
    setMessage,
    t,
  ])
}
