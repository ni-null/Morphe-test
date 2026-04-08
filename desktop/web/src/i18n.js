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

export function getPatchTranslationsForLocale(locale) {
  const lang = normalizeLocale(locale)
  const fallback = messages[DEFAULT_LOCALE]?.__patchTranslations
  const current = messages[lang]?.__patchTranslations
  const source = current && typeof current === "object" ? current : fallback && typeof fallback === "object" ? fallback : {}
  const entries = source && typeof source.entries === "object" ? source.entries : {}
  return entries
}
