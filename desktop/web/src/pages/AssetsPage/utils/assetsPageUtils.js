export const MORPHE_ADD_CUSTOM_REPO_VALUE = "__ADD_CUSTOM_MORPHE_REPO__"
export const PATCHES_ADD_CUSTOM_REPO_VALUE = "__ADD_CUSTOM_PATCHES_REPO__"
export const MICROG_ADD_CUSTOM_REPO_VALUE = "__ADD_CUSTOM_MICROG_REPO__"
export const MORPHE_LOCAL_SOURCE_VALUE = "__MORPHE_LOCAL_SOURCE__"
export const PATCHES_LOCAL_SOURCE_VALUE = "__PATCHES_LOCAL_SOURCE__"
export const MICROG_LOCAL_SOURCE_VALUE = "__MICROG_LOCAL_SOURCE__"

export function normalizePackageIconPath(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  if (/^(https?:|data:|file:)/i.test(text)) return text
  if (text.startsWith("/assets/")) return `.${text}`
  if (text.startsWith("assets/")) return `./${text}`
  return text
}

export function inferGroupKeyFromApk(file) {
  const name = String(file?.name || file?.fileName || "")
  const first = String(name.split("-")[0] || "")
    .trim()
    .toLowerCase()
  if (first) return first
  return "__unknown__"
}

export function groupApksByPackage(files) {
  const list = Array.isArray(files) ? files : []
  const buckets = new Map()
  for (const file of list) {
    const groupKey = inferGroupKeyFromApk(file)
    if (!buckets.has(groupKey)) buckets.set(groupKey, [])
    buckets.get(groupKey).push(file)
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
}

export function buildSectionToPackageMetaMap(source) {
  const out = {}
  if (!source || typeof source !== "object") return out
  for (const [packageName, meta] of Object.entries(source)) {
    const section = String(meta?.section || "")
      .trim()
      .toLowerCase()
    if (!section) continue
    out[section] = {
      packageName: String(packageName || "").trim(),
      label: String(meta?.label || "").trim(),
      icon: normalizePackageIconPath(meta?.icon),
    }
  }
  return out
}

export function formatPublishedAt(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}/${month}/${day}`
}

export function formatRepoPathOnly(relativePath) {
  const normalized = String(relativePath || "").trim().replace(/\\/g, "/")
  if (!normalized) return ""
  const repoDirName = String(normalized.split("/")[0] || "").trim()
  return repoDirName.replace(/@/g, "/")
}

export function normalizeRepoDirFromRepo(repo) {
  return String(repo || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\//g, "@")
    .toLowerCase()
}

export function getRepoDirFromRelativePath(relativePath) {
  const normalized = String(relativePath || "").trim().replace(/\\/g, "/")
  return String(normalized.split("/")[0] || "")
    .trim()
    .toLowerCase()
}

export function buildSourceMixedItems(sourceVersions, localFiles, selectedRepo = "") {
  const remoteList = Array.isArray(sourceVersions) ? sourceVersions : []
  const allLocalList = Array.isArray(localFiles) ? localFiles : []
  const repoDir = normalizeRepoDirFromRepo(selectedRepo)
  const localList = repoDir ? allLocalList.filter((file) => getRepoDirFromRelativePath(file?.relativePath) === repoDir) : allLocalList
  const localByName = new Map()

  for (const file of localList) {
    const fileName = String(file?.name || file?.fileName || "").trim()
    if (!fileName) continue
    localByName.set(fileName.toLowerCase(), file)
  }

  const items = remoteList.map((item) => {
    const fileName = String(item?.fileName || "").trim()
    const local = localByName.get(fileName.toLowerCase()) || null
    return {
      key: `remote-${fileName}`,
      fileName,
      isRemote: true,
      hasLocal: Boolean(local),
      publishedAt: String(item?.publishedAt || local?.publishedAt || "").trim(),
      relativePath: String(local?.relativePath || "").trim(),
      sizeBytes: Number(local?.sizeBytes || 0),
    }
  })

  const remoteNameSet = new Set(items.map((item) => item.fileName.toLowerCase()))
  for (const local of localList) {
    const fileName = String(local?.name || local?.fileName || "").trim()
    if (!fileName) continue
    if (remoteNameSet.has(fileName.toLowerCase())) continue
    items.push({
      key: `local-only-${fileName}`,
      fileName,
      isRemote: false,
      hasLocal: true,
      publishedAt: String(local?.publishedAt || "").trim(),
      relativePath: String(local?.relativePath || "").trim(),
      sizeBytes: Number(local?.sizeBytes || 0),
    })
  }

  return items
}
