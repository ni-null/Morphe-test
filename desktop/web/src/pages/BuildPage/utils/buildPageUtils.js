export function formatBuildPreviewMessage(value) {
  let text = String(value || "").trim()
  if (!text) return ""
  text = text.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/u, "")
  while (/^\[[^\]]+\]\s*/u.test(text)) {
    text = text.replace(/^\[[^\]]+\]\s*/u, "")
  }
  return text.trim()
}

export function inferApkPackageGroup(item) {
  const relativePath = String(item?.relativePath || "")
    .trim()
    .replace(/\\/g, "/")
  if (relativePath) {
    const first = String(relativePath.split("/")[0] || "").trim()
    if (first && !first.toLowerCase().endsWith(".apk")) return first
  }
  const fileName = String(item?.fileName || "").trim()
  const prefix = String(fileName.split("-")[0] || "")
    .trim()
    .toLowerCase()
  return prefix || "unknown"
}

export function formatApkModifiedAt(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${y}/${m}/${d} ${hh}:${mm}`
}
