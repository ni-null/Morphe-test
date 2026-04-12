import { create } from "zustand"
import { DEFAULT_LOCALE } from "../i18n"

function normalizeLocale(value) {
  return String(value || "").trim() === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE
}

function normalizeTheme(value) {
  return String(value || "").trim() === "dark" ? "dark" : "light"
}

export const useUiStore = create((set) => ({
  activeNav: "build",
  locale: DEFAULT_LOCALE,
  theme: "light",
  setActiveNav: (activeNav) =>
    set(() => {
      const value = String(activeNav || "").trim()
      if (value === "mircrog") return { activeNav: "mircrog" }
      if (value === "history") return { activeNav: "history" }
      if (value === "assets") return { activeNav: "assets" }
      if (value === "keystore") return { activeNav: "keystore" }
      return { activeNav: "build" }
    }),
  setLocale: (locale) =>
    set(() => ({
      locale: normalizeLocale(locale),
    })),
  setTheme: (theme) =>
    set(() => ({
      theme: normalizeTheme(theme),
    })),
}))
