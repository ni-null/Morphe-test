import { Code2, FileText, Hammer, Loader2, Package, Pencil, Play, Plus, RefreshCw, Settings2, Smartphone, Square } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Label } from "../components/ui/label"
import { Textarea } from "../components/ui/textarea"
import { cn } from "../lib/utils"

export default function BuildPage({
  t,
  isBuildRunning,
  buildLaunchPending,
  isBuildStopping,
  liveLastLine,
  setLogDialogOpen,
  liveTaskId,
  onStopBuildTask,
  onBuildPrimaryAction,
  rawOverrideMode,
  onToggleRawMode,
  isBusy,
  setConfigPathDialogOpen,
  loadConfig,
  setRawConfigInput,
  generatedToml,
  rawConfigInput,
  setRawConfigInputValue,
  setMorpheSettingsOpen,
  setPatchesSettingsOpen,
  appendApp,
  appTemplateLoading,
  apps,
  updateApp,
  getPackageIcon,
  hasText,
  setAppSettingsId,
  setAppSettingsOpen,
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Hammer className='h-5 w-5' />
            {t("build.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2 rounded-md bg-background p-3'>
            <div className='space-y-2'>
              <div className='flex flex-wrap gap-2'>
                {apps.map((app) => {
                  const enabled = app.mode !== "false"
                  return (
                    <button
                      key={`build-app-enable-${app.id}`}
                      type='button'
                      className={cn(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                        enabled ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                      )}
                      onClick={() => updateApp(app.id, { mode: enabled ? "false" : "remote" })}>
                      {hasText(getPackageIcon(app.packageName)) ? (
                        <img src={getPackageIcon(app.packageName)} alt={app.displayName || app.name || "app"} className='h-5 w-5 rounded-sm object-contain' />
                      ) : (
                        <Smartphone className='h-5 w-5 text-muted-foreground' />
                      )}
                      <span className='font-medium'>{app.displayName || app.name || "app-name"}</span>
                      <span
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          enabled ? "bg-emerald-500" : "bg-slate-300",
                        )}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            {isBuildRunning || buildLaunchPending || isBuildStopping ? (
              <div className='flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm'>
                <div className='min-w-0 flex items-center gap-2'>
                  <Loader2 className='h-5 w-5 animate-spin text-primary' />
                  <span className='font-medium text-primary'>{t("build.progress")}</span>
                  <span className='text-muted-foreground'>|</span>
                  <span className='text-muted-foreground break-all'>{liveLastLine || t("build.waiting")}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='icon'
                    onClick={() => setLogDialogOpen(true)}
                    disabled={!liveTaskId}
                    aria-label={t("build.openCurrentLog")}
                    title={t("build.openCurrentLog")}>
                    <FileText className='h-5 w-5' />
                  </Button>
                  <Button
                    variant='outline'
                    onClick={onStopBuildTask}
                    disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
                    className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
                    <Square className='h-5 w-5' />
                    {isBuildStopping ? t("build.stopping") : t("build.stop")}
                  </Button>
                </div>
              </div>
            ) : null}
            {!isBuildRunning && !isBuildStopping && !buildLaunchPending ? (
              <Button className='w-full' variant='default' onClick={onBuildPrimaryAction}>
                <Play className='h-5 w-5' />
                {t("build.start")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <CardTitle className='flex items-center gap-2'>
                <Settings2 className='h-5 w-5' />
                {t("settings.title")}
              </CardTitle>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='ghost'
                className={cn(
                  "h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200",
                  rawOverrideMode ? "bg-slate-200" : "bg-slate-100",
                )}
                onClick={onToggleRawMode}
                disabled={isBusy}>
                <Code2 className='h-4 w-4' />
                {t("settings.raw")}
              </Button>
              <Button
                variant='ghost'
                className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200'
                onClick={() => setConfigPathDialogOpen(true)}
                disabled={isBusy}
                aria-label={t("dialog.configPathTitle")}
                title={t("dialog.configPathTitle")}>
                <Pencil className='h-4 w-4' />
                {t("settings.path")}
              </Button>
              <Button variant='ghost' className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200' onClick={loadConfig} disabled={isBusy}>
                <RefreshCw className='h-4 w-4' />
                {t("settings.reload")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className='space-y-4'>
          {rawOverrideMode ? (
            <div className='space-y-2'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <Label htmlFor='raw-toml'>{t("settings.rawInput")}</Label>
                <Button variant='outline' onClick={() => setRawConfigInput(generatedToml)} disabled={isBusy}>
                  {t("settings.applyForm")}
                </Button>
              </div>
              <Textarea
                id='raw-toml'
                className='min-h-[340px] font-mono text-xs'
                value={rawConfigInput}
                onChange={(event) => setRawConfigInputValue(event.target.value)}
                spellCheck={false}
              />
            </div>
          ) : (
            <div className='space-y-4'>
              <section className='space-y-2'>
                <h3 className='text-base font-semibold'>{t("settings.source")}</h3>
                <div className='flex flex-wrap gap-2'>
                  <Button variant='outline' className='h-11 px-5 text-base' onClick={() => setMorpheSettingsOpen(true)} disabled={isBusy}>
                    <Settings2 className='h-6 w-6' />
                    morphe-cli
                  </Button>
                  <Button variant='outline' className='h-11 px-5 text-base' onClick={() => setPatchesSettingsOpen(true)} disabled={isBusy}>
                    <Package className='h-6 w-6' />
                    patches
                  </Button>
                </div>
              </section>

              <section className='space-y-3 pt-1'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='text-base font-semibold'>{t("settings.apps")}</h3>
                  <Button variant='outline' className='h-11 px-5 text-base' onClick={appendApp} disabled={isBusy || appTemplateLoading}>
                    {appTemplateLoading ? <Loader2 className='h-6 w-6 animate-spin' /> : <Plus className='h-6 w-6' />}
                    {t("settings.loadTemplate")}
                  </Button>
                </div>

                <div className='flex flex-wrap gap-2'>
                  {apps.map((app) => (
                    <Card key={app.id} className='border-0 shadow-none bg-transparent'>
                      <div
                        role='button'
                        tabIndex={0}
                        className='inline-flex min-h-20 items-center gap-5 rounded-md px-5 py-4 cursor-pointer bg-muted/35 hover:bg-accent/35'
                        onClick={() => {
                          setAppSettingsId(app.id)
                          setAppSettingsOpen(true)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setAppSettingsId(app.id)
                            setAppSettingsOpen(true)
                          }
                        }}>
                        <div className='flex items-center gap-2'>
                          {hasText(getPackageIcon(app.packageName)) ? (
                            <img
                              src={getPackageIcon(app.packageName)}
                              alt={app.displayName || app.name || "app"}
                              className='h-6 w-6 rounded-sm object-contain grayscale contrast-75 brightness-110'
                            />
                          ) : (
                            <Smartphone className='h-6 w-6 text-muted-foreground' />
                          )}
                          <span className='text-lg font-medium whitespace-nowrap'>{app.displayName || app.name || "app-name"}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
