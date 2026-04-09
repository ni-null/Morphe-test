export function statusVariant(status) {
  const value = String(status || "").toLowerCase()
  if (value === "completed") return "success"
  if (value === "canceled") return "failed"
  if (value === "failed") return "failed"
  if (value === "stopping") return "running"
  if (value === "running") return "running"
  return "outline"
}

export function formatTaskLabel(task) {
  const startedAt = task.startedAt ? new Date(task.startedAt).toLocaleString() : "-"
  const folder = task.taskFolderName || task.id
  return `${folder} · ${startedAt}`
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let next = value
  let index = 0
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024
    index += 1
  }
  return `${next.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

export function isNotFoundError(error) {
  const text = String(error?.message || error || "").toLowerCase()
  return text.includes("404") || text.includes("not found")
}
