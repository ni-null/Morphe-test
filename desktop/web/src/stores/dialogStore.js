import { create } from "zustand"

function resolveNext(prev, next) {
  return typeof next === "function" ? next(prev) : next
}

export const useDialogStore = create((set) => ({
  logDialogOpen: false,
  configPathDialogOpen: false,
  appSettingsOpen: false,
  appSettingsId: "",
  morpheSettingsOpen: false,
  patchesSettingsOpen: false,
  appDlurlPopoverOpen: false,
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
  setMorpheSettingsOpen: (value) => set((state) => ({ morpheSettingsOpen: resolveNext(state.morpheSettingsOpen, value) })),
  setPatchesSettingsOpen: (value) => set((state) => ({ patchesSettingsOpen: resolveNext(state.patchesSettingsOpen, value) })),
  setAppDlurlPopoverOpen: (value) => set((state) => ({ appDlurlPopoverOpen: resolveNext(state.appDlurlPopoverOpen, value) })),
  setConfirmDialog: (value) => set((state) => ({ confirmDialog: resolveNext(state.confirmDialog, value) })),
  setConfirmDialogBusy: (value) => set((state) => ({ confirmDialogBusy: resolveNext(state.confirmDialogBusy, value) })),
}))
