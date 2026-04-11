export const BUILD_STAGE_DEFINITIONS = [
  { key: "engineCli", labelKey: "build.stage.engineCli" },
  { key: "patches", labelKey: "build.stage.patches" },
  { key: "downloadApk", labelKey: "build.stage.downloadApk" },
  { key: "javaBuild", labelKey: "build.stage.javaBuild" },
]

export function detectBuildStageIndexFromLine(line) {
  const text = String(line || "")
    .trim()
    .toLowerCase()
  if (!text) return -1

  const matchesJavaBuild =
    (text.includes("java") && (text.includes("-jar") || text.includes("list-patches") || text.includes("patch"))) || text.includes("running java")
  if (matchesJavaBuild) return 3

  const matchesDownloadApk =
    text.includes("download apk") ||
    text.includes("resolved download url") ||
    text.includes("provider downloaded file") ||
    text.includes("using local apk") ||
    text.includes("下載 apk") ||
    text.includes("下載並保存成功")
  if (matchesDownloadApk) return 2

  const matchesPatches = text.includes("patch file") || text.includes("auto patch bundle") || text.includes("patches") || text.includes(" patch ")
  if (matchesPatches) return 1

  const matchesEngineCli = text.includes("engine-cli") || text.includes("locked engine-cli") || text.includes("auto engine-cli")
  if (matchesEngineCli) return 0

  return -1
}
