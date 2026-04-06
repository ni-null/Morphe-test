import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { DEFAULT_LOCALE } from "../i18n"

const UI_STORE_KEY = "morphe.ui.state"

function normalizeLocale(value) {
  return String(value || "").trim() === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE
}

export const useUiStore = create(
  persist(
    (set) => ({
      activeNav: "build",
      locale: DEFAULT_LOCALE,
      setActiveNav: (activeNav) =>
        set(() => {
          const value = String(activeNav || "").trim()
          if (value === "history") return { activeNav: "history" }
          if (value === "assets") return { activeNav: "assets" }
          return { activeNav: "build" }
        }),
      setLocale: (locale) =>
        set(() => ({
          locale: normalizeLocale(locale),
        })),
    }),
    {
      name: UI_STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeNav: state.activeNav,
        locale: state.locale,
      }),
    },
  ),
)
