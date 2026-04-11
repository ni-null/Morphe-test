import { create } from "zustand"

function resolveNext(prev, next) {
  return typeof next === "function" ? next(prev) : next
}

export const useDialogStore = create((set) => ({
  logDialogOpen: false,
  configPathDialogOpen: false,
  appSettingsOpen: false,
  appSettingsId: "",
  engineSettingsOpen: false,
  patchBundleSettingsOpen: false,
  confirmDialog: {
    open: false,
    action: "",
    title: "",
    description: "",
    payload: null,
  },
  confirmDialogBusy: false,

  setLogDialogOpen: (value) => set((state) => ({ logDialogOpen: resolveNext(state.logDialogOpen, value) })),
  setConfigPathDialogOpen: (value) => set((state) => ({ configPathDialogOpen: resolveNext(state.configPathDialogOpen, value) })),
  setAppSettingsOpen: (value) => set((state) => ({ appSettingsOpen: resolveNext(state.appSettingsOpen, value) })),
  setAppSettingsId: (value) => set((state) => ({ appSettingsId: resolveNext(state.appSettingsId, value) })),
  setEngineSettingsOpen: (value) =>
    set((state) => {
      const next = resolveNext(state.engineSettingsOpen, value)
      return { engineSettingsOpen: next }
    }),
  setPatchBundleSettingsOpen: (value) =>
    set((state) => {
      const next = resolveNext(state.patchBundleSettingsOpen, value)
      return { patchBundleSettingsOpen: next }
    }),
  setConfirmDialog: (value) => set((state) => ({ confirmDialog: resolveNext(state.confirmDialog, value) })),
  setConfirmDialogBusy: (value) => set((state) => ({ confirmDialogBusy: resolveNext(state.confirmDialogBusy, value) })),
}))
