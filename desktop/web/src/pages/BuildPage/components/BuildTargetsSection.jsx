import { Plus, Settings2, Smartphone } from "lucide-react"
import { cn } from "../../../lib/utils"

export default function BuildTargetsSection({
  t,
  apps,
  updateApp,
  hasText,
  getPackageIcon,
  setAppSettingsId,
  setAppSettingsOpen,
  isBusy,
  onAddCustom,
  controlsLocked,
}) {
  return (
    <section className='space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700'>
      <p className='text-sm text-slate-700 dark:text-slate-300'>{t("build.targets")}</p>
      <div className='flex flex-wrap gap-2'>
        {apps.map((app) => {
          const enabled = app.mode !== "false"
          return (
            <div
              key={`build-app-enable-${app.id}`}
              className={cn(
                "inline-flex items-stretch overflow-hidden rounded-md text-sm transition-colors",
                "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
              )}>
              <button
                type='button'
                className='inline-flex items-center gap-2 px-3 py-2 transition-colors disabled:pointer-events-none disabled:opacity-60'
                onClick={() => updateApp(app.id, { mode: enabled ? "false" : "remote" })}
                disabled={controlsLocked}
              >
                {hasText(getPackageIcon(app.packageName)) ? (
                  <img
                    src={getPackageIcon(app.packageName)}
                    alt={app.displayName || app.name || "app"}
                    className={cn("h-5 w-5 rounded-sm object-contain transition-all", enabled ? "" : "grayscale opacity-55 saturate-0")}
                  />
                ) : (
                  <Smartphone className='h-5 w-5 text-muted-foreground' />
                )}
                <span className='font-medium'>{app.displayName || app.name || "app-name"}</span>
                <span className={cn("inline-block h-2.5 w-2.5 rounded-full", enabled ? "bg-[#87d369]" : "bg-slate-300 dark:bg-slate-600")} />
              </button>
              <button
                type='button'
                className='inline-flex items-center justify-center border-l border-black/10 px-2 transition-colors hover:bg-black/5 disabled:pointer-events-none disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5'
                onClick={() => {
                  setAppSettingsId(app.id)
                  setAppSettingsOpen(true)
                }}
                disabled={controlsLocked}
                aria-label={`${app.displayName || app.name || "app"} settings`}
                title={`${app.displayName || app.name || "app"} settings`}>
                <Settings2 className='h-4 w-4' />
              </button>
            </div>
          )
        })}
        <button
          type='button'
          className='inline-flex h-[42px] items-center gap-2 rounded-md bg-slate-50 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          onClick={onAddCustom}
          disabled={isBusy || controlsLocked}
          title={t("dialog.addAppTitle")}
          aria-label={t("dialog.addAppTitle")}>
          <Plus className='h-4 w-4' />
        </button>
      </div>
    </section>
  )
}
