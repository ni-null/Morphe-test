import React from "react"
import { createRoot } from "react-dom/client"
import useAppController from "./hooks/useAppController"
import BuildPage from "./pages/BuildPage"
import MircrogPage from "./pages/MircrogPage"
import HistoryPage from "./pages/HistoryPage"
import AssetsPage from "./pages/AssetsPage"
import Sidebar from "./components/layout/sidebar/Sidebar"
import AppSettingsDialog from "./pages/BuildPage/components/AppSettingsDialog"
import ConfigPathDialog from "./pages/BuildPage/components/ConfigPathDialog"
import ConfirmActionDialog from "./components/dialogs/ConfirmActionDialog"
import EngineSettingsDialog from "./pages/AssetsPage/components/EngineSettingsDialog"
import PatchesSettingsDialog from "./pages/AssetsPage/components/PatchesSettingsDialog"
import TaskDialogs from "./components/dialogs/TaskDialogs"
import "./styles.css"

function App() {
  const c = useAppController()
  const engineSettingsDialogProps = c.engineSettingsDialogProps || {}
  const patchBundleSettingsDialogProps = c.patchBundleSettingsDialogProps || {}

  return (
    <div className='shell-layout'>
      <Sidebar controller={c} />

      <main className='main-panel min-h-screen space-y-4 bg-[#f8f8f8] dark:bg-background'>
        {c.activeNav === c.navKeys.build ? <BuildPage {...c.buildPageProps} /> : null}
        {c.activeNav === c.navKeys.mircrog ? <MircrogPage {...c.mircrogPageProps} /> : null}
        {c.activeNav === c.navKeys.assets ? <AssetsPage {...c.assetsPageProps} /> : null}
        {c.activeNav === c.navKeys.history ? <HistoryPage {...c.historyPageProps} /> : null}

        <TaskDialogs {...c.taskDialogsProps} />
        <ConfigPathDialog {...c.configPathDialogProps} />
        <AppSettingsDialog {...c.appSettingsDialogProps} />
        <EngineSettingsDialog {...engineSettingsDialogProps} />
        <PatchesSettingsDialog {...patchBundleSettingsDialogProps} />
        <ConfirmActionDialog {...c.confirmActionDialogProps} />
      </main>
    </div>
  )
}

const rootElement = document.getElementById("root")
if (rootElement) {
  const globalKey = "__PATCHER_APP_ROOT__"
  const host = window
  const root = host[globalKey] || createRoot(rootElement)
  host[globalKey] = root
  root.render(<App />)
}
