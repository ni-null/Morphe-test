import { hasText } from "./app-utils"
import { lookupPatchTranslation } from "../i18n"

/**
 * Get translated patch name and description.
 *
 * @param {string} locale - Current locale (e.g. "en", "zh-TW")
 * @param {string} packageName - App package name (e.g. "com.google.android.youtube")
 * @param {string} name - Patch name from CLI output
 * @param {string} description - Patch description from CLI output
 * @returns {{ name: string, description: string }}
 */
export function getPatchTranslation(locale, packageName, name, description) {
  const rawName = String(name || "").trim()
  const rawDescription = String(description || "").trim()

  if (!hasText(rawName)) {
    return { name: rawName, description: rawDescription }
  }

  return lookupPatchTranslation(packageName, rawName, rawDescription, locale)
}
