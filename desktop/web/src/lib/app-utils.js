import { PACKAGE_NAME_LABELS, PACKAGE_NAME_ICON_FALLBACKS } from "./app-constants"

export function hasText(value) {
  return String(value || "").trim().length > 0
}

export function normalizePackageIconPath(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  if (/^(https?:|data:|file:)/i.test(text)) return text
  if (text.startsWith("/assets/")) return `.${text}`
  if (text.startsWith("assets/")) return `./${text}`
  return text
}

export function getPackageIconFallback(packageName) {
  const key = String(packageName || "").trim().toLowerCase()
  if (!key) return ""
  return hasText(PACKAGE_NAME_ICON_FALLBACKS[key])
    ? normalizePackageIconPath(PACKAGE_NAME_ICON_FALLBACKS[key])
    : ""
}

export function extractSourceFolderLabel(file) {
  const relativePath = String(file?.relativePath || "").trim().replace(/\\/g, "/")
  if (relativePath) {
    const repoDir = String(relativePath.split("/")[0] || "").trim()
    if (repoDir) return repoDir.replace(/@/g, "/")
  }
  return ""
}

export function mergeRepoOptions(prev, candidate, baseRepo = "") {
  const list = Array.isArray(prev) ? prev : []
  const merged = list.map((item) => String(item || "").trim()).filter(Boolean)
  const repo = String(candidate || "").trim()
  if (repo && !merged.some((item) => item.toLowerCase() === repo.toLowerCase())) {
    merged.push(repo)
  }
  const base = String(baseRepo || "").trim()
  if (base && !merged.some((item) => item.toLowerCase() === base.toLowerCase())) {
    merged.unshift(base)
  }
  return Array.from(new Set(merged))
}

function extractVersionPartsFromName(name) {
  const text = String(name || "").toLowerCase()
  const match = text.match(/(\d+(?:\.\d+){1,4})(?:[-._]?(dev|alpha|beta|rc)[-._]?(\d+)?)?/u)
  if (!match) return null
  const numbers = String(match[1] || "")
    .split(".")
    .map((item) => Number(item))
    .map((item) => (Number.isFinite(item) ? item : 0))
  while (numbers.length < 5) numbers.push(0)
  const tag = String(match[2] || "").trim().toLowerCase()
  const tagNum = Number(match[3] || 0)
  const tagRankMap = { dev: 1, alpha: 2, beta: 3, rc: 4 }
  const tagRank = tag ? tagRankMap[tag] || 0 : 5
  return { numbers, tagRank, tagNum: Number.isFinite(tagNum) ? tagNum : 0 }
}

function compareVersionPartsDesc(left, right) {
  for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i += 1) {
    const l = left.numbers[i] || 0
    const r = right.numbers[i] || 0
    if (l !== r) return r - l
  }
  if (left.tagRank !== right.tagRank) return right.tagRank - left.tagRank
  if (left.tagNum !== right.tagNum) return right.tagNum - left.tagNum
  return 0
}

export function pickSourceFileName(fullPath) {
  const value = String(fullPath || "").trim()
  if (!value) return ""
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts.length > 0 ? parts[parts.length - 1] : value
}

export function sortFilesByVersion(items) {
  const list = Array.isArray(items) ? items : []
  return [...list].sort((a, b) => {
    const nameA = String(a?.name || a?.fileName || pickSourceFileName(a?.fullPath) || "").trim()
    const nameB = String(b?.name || b?.fileName || pickSourceFileName(b?.fullPath) || "").trim()
    const versionA = extractVersionPartsFromName(nameA)
    const versionB = extractVersionPartsFromName(nameB)

    if (versionA && versionB) {
      const diff = compareVersionPartsDesc(versionA, versionB)
      if (diff !== 0) return diff
    } else if (versionA && !versionB) {
      return -1
    } else if (!versionA && versionB) {
      return 1
    }

    const nameDiff = nameB.localeCompare(nameA, undefined, { numeric: true, sensitivity: "base" })
    if (nameDiff !== 0) return nameDiff
    const pathA = String(a?.relativePath || a?.fullPath || "").trim()
    const pathB = String(b?.relativePath || b?.fullPath || "").trim()
    return pathB.localeCompare(pathA, undefined, { numeric: true, sensitivity: "base" })
  })
}

export function dedupeSourceVersions(items) {
  const list = Array.isArray(items) ? items : []
  const seen = new Set()
  const output = []
  for (const item of list) {
    const fileName = String(item?.fileName || "").trim()
    if (!fileName) continue
    const key = fileName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ ...item, fileName })
  }
  return output
}

export function packageToSectionName(packageName) {
  const key = String(packageName || "").trim().toLowerCase()
  if (hasText(PACKAGE_NAME_LABELS[key])) {
    const mapped = String(PACKAGE_NAME_LABELS[key]).trim()
    const mappedNormalized = mapped.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
    if (mappedNormalized) {
      if (/^[0-9]/u.test(mappedNormalized)) return `app_${mappedNormalized}`
      return mappedNormalized
    }
  }
  const normalized = String(packageName || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  if (!normalized) return "app_template"
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`
  return normalized
}

export function customAppNameToSectionName(name) {
  const normalized = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  if (!normalized) return "custom_app"
  if (/^[0-9]/u.test(normalized)) return `app_${normalized}`
  return normalized
}

export function resolveDisplayName(packageName, fallbackName) {
  const key = String(packageName || "").trim().toLowerCase()
  if (hasText(PACKAGE_NAME_LABELS[key])) return PACKAGE_NAME_LABELS[key]
  if (hasText(packageName)) return `[${String(packageName).trim()}]`
  if (hasText(fallbackName)) return String(fallbackName).trim()
  return "app"
}

export function normalizeTemplatePackageName(template) {
  const directCandidates = [template?.packageName, template?.package_name, template?.package]
  for (const candidate of directCandidates) {
    if (hasText(candidate)) return String(candidate).trim()
  }

  const section = hasText(template?.section)
    ? String(template.section).trim()
    : hasText(template?.key)
      ? String(template.key).trim()
      : ""
  if (!section) return ""

  if (!section.includes(".") && /_/u.test(section)) {
    const restored = section.replace(/_/gu, ".")
    if (/^[a-z0-9]+(\.[a-z0-9_]+)+$/iu.test(restored)) return restored
  }
  return ""
}
