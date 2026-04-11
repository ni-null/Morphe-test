import { hasText } from "./app-utils"

export function buildTaskPayload(configPath, flags, signingKeystorePath = "") {
  const safeFlags = flags || {}
  return {
    configPath,
    signingKeystorePath: hasText(signingKeystorePath) ? String(signingKeystorePath).trim() : "",
    dryRun: !!safeFlags.dryRun,
    force: !!safeFlags.force,
    downloadOnly: false,
    patchesOnly: false,
    engineCliOnly: false,
    persistLogs: true,
  }
}

export function isBuildTask(task) {
  if (!task || !task.modes) return true
  const modes = task.modes || {}
  return !modes.downloadOnly && !modes.patchesOnly && !modes.engineCliOnly
}
