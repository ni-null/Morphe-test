import enMessages from "../i18n/locales/en.json"
import zhTwMessages from "../i18n/locales/zh-TW.json"

export const DEFAULT_LOCALE = "en"
export const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "zh-TW", label: "繁體中文" },
]

const messages = {
  en: enMessages,
  "zh-TW": zhTwMessages,
}

// Cache for dynamically loaded patch translation files
const patchTranslationCache = new Map()

// Vite glob for patch translation files (eager = synchronously available)
const patchModules = import.meta.glob("../i18n/patches/*.json", { eager: true })

// Pre-populate cache at module load time
// Note: Vite glob keys can be relative paths like "../i18n/patches/xxx.json"
// or absolute-like paths depending on configuration
let globalPatches = null
for (const [path, mod] of Object.entries(patchModules)) {
  // Match any path ending with /patches/{packageName}.json
  const match = path.match(/[/\\]patches[/\\](.+)\.json$/)
  if (match) {
    const pkgName = match[1].toLowerCase()
    const data = mod.default || mod
    if (pkgName === "_global") {
      // _global.json uses same structure as app files: { "patches": { ... } }
      globalPatches = data?.patches || {}
    } else {
      patchTranslationCache.set(pkgName, data)
    }
  }
}

export function normalizeLocale(locale) {
  return String(locale || "").trim() === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE
}

export function t(locale, key, vars = {}) {
  const lang = normalizeLocale(locale)
  const fallback = messages[DEFAULT_LOCALE] || {}
  const table = messages[lang] || fallback
  const template = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : fallback[key] || key
  return String(template).replace(/\{\{(\w+)\}\}/g, (_full, name) => String(vars[name] ?? ""))
}

/**
 * Resolve patch translation file path from package name.
 */
function resolvePatchPath(packageName) {
  const name = String(packageName || "").trim().toLowerCase()
  if (!name) return null
  return `../i18n/patches/${name}.json`
}

/**
 * Load patch translations for a specific package.
 */
export async function loadPatchTranslations(packageName) {
  if (!packageName) return null
  const cacheKey = packageName.toLowerCase()
  if (patchTranslationCache.has(cacheKey)) {
    return patchTranslationCache.get(cacheKey)
  }
  const patchPath = resolvePatchPath(packageName)
  if (!patchPath) return null

  try {
    const loader = patchModules[patchPath]
    if (loader) {
      const data = loader.default || loader
      patchTranslationCache.set(cacheKey, data)
      return data
    }
    patchTranslationCache.set(cacheKey, null)
    return null
  } catch {
    patchTranslationCache.set(cacheKey, null)
    return null
  }
}

/**
 * Preload patch translations synchronously (for sync usage).
 * Falls back to patchModules directly if cache is empty.
 */
export function getPatchTranslationsSync(packageName) {
  if (!packageName) return null
  const cacheKey = packageName.toLowerCase()

  // Try cache first
  const cached = patchTranslationCache.get(cacheKey)
  if (cached !== undefined) return cached

  // Fallback: search patch modules directly
  const targetFile = `${cacheKey}.json`
  for (const [path, mod] of Object.entries(patchModules)) {
    if (path.toLowerCase().endsWith(targetFile)) {
      const data = mod.default || mod
      patchTranslationCache.set(cacheKey, data)
      return data
    }
  }

  patchTranslationCache.set(cacheKey, null)
  return null
}

/**
 * Normalize whitespace for description matching.
 * Collapses multiple spaces, tabs, newlines into single space.
 */
function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim()
}

/**
 * Look up a single patch translation entry.
 *
 * Structure in patch JSON:
 * {
 *   "patches": {
 *     "patch_name_lower": {
 *       "name": { "en": "...", "zh-TW": "..." },
 *       "descriptions": {
 *         "original english description": { "zh-TW": "..." }
 *       }
 *     }
 *   }
 * }
 *
 * Description matching is whitespace-insensitive to handle CLI output
 * variations (e.g., double spaces).
 */
export function lookupPatchTranslation(packageName, patchName, patchDescription, locale) {
  const lang = normalizeLocale(locale)
  const data = getPatchTranslationsSync(packageName)
  const appPatches = data?.patches || {}

  // Merge global patches (lower priority) with app-specific patches (higher priority)
  const patches = { ...(globalPatches || {}), ...appPatches }

  const key = String(patchName || "").trim().toLowerCase()
  if (!key) {
    return { name: patchName, description: patchDescription }
  }

  const entry = patches[key]
  if (!entry) {
    return { name: patchName, description: patchDescription }
  }

  // Resolve translated name
  let translatedName = patchName
  if (entry.name && typeof entry.name === "object") {
    translatedName = entry.name[lang] || entry.name[DEFAULT_LOCALE] || patchName
  }

  // Resolve translated description - match with whitespace normalization
  let translatedDescription = patchDescription
  const rawDesc = String(patchDescription || "").trim()
  if (rawDesc && entry.descriptions && typeof entry.descriptions === "object") {
    const rawNorm = normalizeWhitespace(rawDesc)
    // Try exact match first, then normalized
    const descEntry = entry.descriptions[rawDesc] ||
      Object.entries(entry.descriptions).find(([d]) => normalizeWhitespace(d) === rawNorm)?.[1]
    if (descEntry && typeof descEntry === "object") {
      const translated = descEntry[lang]
      if (translated && String(translated).trim()) {
        translatedDescription = String(translated).trim()
      }
    }
  }

  return {
    name: translatedName,
    description: translatedDescription,
  }
}
