import { Globe, Moon, Sun } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { cn } from "../../lib/utils"
import { SUPPORTED_LOCALES } from "../../i18n"
import BuildPage from "../../pages/BuildPage"
import HistoryPage from "../../pages/HistoryPage"
import AssetsPage from "../../pages/AssetsPage"
import AppSettingsDialog from "./AppSettingsDialog"
import ConfigPathDialog from "../dialogs/ConfigPathDialog"
import ConfirmActionDialog from "../dialogs/ConfirmActionDialog"
import MorpheSettingsDialog from "../source/MorpheSettingsDialog"
import PatchesSettingsDialog from "../source/PatchesSettingsDialog"
import TaskDialogs from "../task/TaskDialogs"

function AppLayout({ controller }) {
  const c = controller

  return (
    <div className='shell-layout'>
      <aside className='left-panel flex flex-col gap-4'>
        <div>
          <h1 className='text-lg font-semibold'>Morphe Console</h1>
          <p className='text-sm text-muted-foreground'>{c.t("sidebar.subtitle")}</p>
        </div>

        <nav className='space-y-2'>
          {c.navItems.map((item) => {
            const Icon = item.icon
            const active = c.activeNav === item.key
            return (
              <button
                key={item.key}
                type='button'
                className={cn("sidebar-btn", active ? "sidebar-btn-active" : "sidebar-btn-idle")}
                onClick={() => c.setActiveNav(item.key)}>
                <Icon className='h-5 w-5' />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className='mt-auto space-y-3'>
          <div className='space-y-2 rounded-md bg-slate-100/80 p-2.5 dark:bg-slate-800/70'>
            <div className='flex items-center justify-between gap-2 text-xs'>
              <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                <span
                  className={`h-2 w-2 rounded-full ${c.javaEnv.loading ? "bg-slate-300 dark:bg-slate-500" : c.javaEnv.installed ? "bg-emerald-400/80" : "bg-red-400/80"}`}
                />
                {c.t("sidebar.javaVersion")}
              </span>
              <span className='font-medium'>
                {c.javaEnv.loading
                  ? c.t("sidebar.checking")
                  : c.javaEnv.installed
                    ? c.hasText(c.javaEnv.version)
                      ? c.javaEnv.version
                      : "OK"
                    : c.t("sidebar.notInstalled")}
              </span>
            </div>
          </div>
          <div className='space-y-1'>
            <div className='flex items-center gap-2'>
              <Select value={c.locale} onValueChange={c.setLocale}>
                <SelectTrigger className='h-9 min-w-0 flex-1'>
                  <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                    <Globe className='h-3.5 w-3.5' />
                  </span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-9 w-9 shrink-0 border-0 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                onClick={() => c.setTheme(c.theme === "dark" ? "light" : "dark")}
                aria-label={c.locale === "zh-TW" ? "切換深色模式" : "Toggle dark mode"}
                title={c.locale === "zh-TW" ? "切換深色模式" : "Toggle dark mode"}
              >
                {c.theme === "dark" ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
              </Button>
            </div>
          </div>
          {c.hasText(c.message) ? <p className='text-xs text-muted-foreground break-words'>{c.message}</p> : null}
        </div>
      </aside>

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

export default AppLayout
