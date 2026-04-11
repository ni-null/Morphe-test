import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { DEFAULT_LOCALE } from "../i18n"

const UI_STORE_KEY = "patcher.ui.state"

function normalizeLocale(value) {
  return String(value || "").trim() === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE
}

function normalizeTheme(value) {
  return String(value || "").trim() === "dark" ? "dark" : "light"
}

export const useUiStore = create(
  persist(
    (set) => ({
      activeNav: "build",
      locale: DEFAULT_LOCALE,
      theme: "light",
      setActiveNav: (activeNav) =>
        set(() => {
          const value = String(activeNav || "").trim()
          if (value === "mircrog") return { activeNav: "mircrog" }
          if (value === "history") return { activeNav: "history" }
          if (value === "assets") return { activeNav: "assets" }
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
    }),
    {
      name: UI_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeNav: state.activeNav,
        locale: state.locale,
        theme: state.theme,
      }),
    },
  ),
)
