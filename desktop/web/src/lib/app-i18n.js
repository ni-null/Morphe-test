import { hasText } from "./app-utils"
import { getPatchTranslationsForLocale } from "../i18n"

export function getPatchTranslation(locale, name, description) {
  const rawName = String(name || "").trim()
  const rawDescription = String(description || "").trim()
  if (!hasText(rawName)) return { name: rawName, description: rawDescription }

  const entries = getPatchTranslationsForLocale(locale)
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim()
  const normalizedName = normalize(rawName)
  const normalizedDescription = normalize(rawDescription)
  const exactKey = JSON.stringify([rawName, rawDescription])
  const normalizedKey = JSON.stringify([normalizedName, normalizedDescription])
  const byNameOnlyKey = JSON.stringify([rawName, ""])

  const table = entries && typeof entries === "object" ? entries : {}
  const byKey = table[exactKey] || table[normalizedKey] || table[byNameOnlyKey] || null
  const localized = byKey && typeof byKey === "object" ? byKey[locale] : null

  let translatedDescription = rawDescription
  if (localized && typeof localized.description === "string" && hasText(localized.description)) {
    translatedDescription = String(localized.description).trim()
  } else if (hasText(rawDescription)) {
    for (const [key, value] of Object.entries(table)) {
      if (!value || typeof value !== "object") continue
      const localizedCandidate = value[locale]
      if (!localizedCandidate || typeof localizedCandidate !== "object") continue
      const translatedCandidate = String(localizedCandidate.description || "").trim()
      if (!hasText(translatedCandidate)) continue
      try {
        const parsed = JSON.parse(key)
        const sourceDesc = Array.isArray(parsed) ? normalize(parsed[1]) : ""
        if (sourceDesc && sourceDesc === normalizedDescription) {
          translatedDescription = translatedCandidate
          break
        }
      } catch { /* skip */ }
    }
  }

  return {
    name: localized && hasText(localized.name) ? String(localized.name).trim() : rawName,
    description: translatedDescription,
  }
}
