import React from "react"
import { createRoot } from "react-dom/client"
import useAppController from "./useAppController"
import BuildPage from "./pages/BuildPage"
import HistoryPage from "./pages/HistoryPage"
import AssetsPage from "./pages/AssetsPage"
import Sidebar from "./components/layout/sidebar/Sidebar"
import AppSettingsDialog from "./pages/BuildPage/components/AppSettingsDialog"
import ConfigPathDialog from "./pages/BuildPage/components/ConfigPathDialog"
import ConfirmActionDialog from "./components/dialogs/ConfirmActionDialog"
import MorpheSettingsDialog from "./pages/AssetsPage/components/MorpheSettingsDialog"
import PatchesSettingsDialog from "./pages/AssetsPage/components/PatchesSettingsDialog"
import TaskDialogs from "./components/dialogs/TaskDialogs"
import "./styles.css"

function App() {
  const c = useAppController()

  return (
    <div className='shell-layout'>
      <Sidebar controller={c} />

      <main className='main-panel min-h-screen space-y-4 bg-[#f8f8f8] dark:bg-background'>
        {c.activeNav === c.navKeys.build ? <BuildPage {...c.buildPageProps} /> : null}
        {c.activeNav === c.navKeys.assets ? <AssetsPage {...c.assetsPageProps} /> : null}
        {c.activeNav === c.navKeys.history ? <HistoryPage {...c.historyPageProps} /> : null}

        <TaskDialogs {...c.taskDialogsProps} />
        <ConfigPathDialog {...c.configPathDialogProps} />
        <AppSettingsDialog {...c.appSettingsDialogProps} />
        <MorpheSettingsDialog {...c.morpheSettingsDialogProps} />
        <PatchesSettingsDialog {...c.patchesSettingsDialogProps} />
        <ConfirmActionDialog {...c.confirmActionDialogProps} />
      </main>
    </div>
  )
}

createRoot(document.getElementById("root")).render(<App />)
