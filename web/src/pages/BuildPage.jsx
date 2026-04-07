import { useEffect, useMemo, useState } from "react"
import { Code2, FileText, Hammer, Package, Pencil, Play, Plus, RefreshCw, Settings2, Smartphone, Square } from "lucide-react"
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
  liveTaskStartedAt,
  buildProgressStages,
  onOpenLogDialog,
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
  const [nowMs, setNowMs] = useState(() => Date.now())
  const isWorking = isBuildRunning || buildLaunchPending || isBuildStopping

  useEffect(() => {
    if (!isWorking) return
    const timer = globalThis.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => globalThis.clearInterval(timer)
  }, [isWorking])

  const elapsedSeconds = useMemo(() => {
    const startMs = Date.parse(String(liveTaskStartedAt || ""))
    if (!Number.isFinite(startMs) || startMs <= 0) return 0
    const diffMs = Math.max(0, nowMs - startMs)
    return Math.floor(diffMs / 1000)
  }, [liveTaskStartedAt, nowMs])

  return (
    <>
      <Card className='border-0 shadow-sm'>
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
                        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        enabled ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "bg-white text-slate-600 hover:bg-slate-100",
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
              <div className='flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm'>
                <div className='inline-flex shrink-0 items-center gap-1'>
                  {(Array.isArray(buildProgressStages) ? buildProgressStages : []).map((stage) => (
                    <span
                      key={`build-stage-${stage.key}`}
                      title={stage.label}
                      className={cn(
                        "h-3.5 w-3.5 cursor-help rounded-[3px] transition-colors",
                        stage.state === "active" && "bg-sky-500 animate-pulse [animation-duration:0.7s]",
                        stage.state === "done"
                          ? "bg-sky-200 hover:bg-sky-300"
                          : "bg-slate-200 hover:bg-slate-300",
                      )}
                    />
                  ))}
                </div>
                <span className='shrink-0 text-xs text-muted-foreground'>{isBuildStopping ? t("build.stopping") : t("dialog.running")}</span>
                <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>{liveLastLine || t("build.waiting")}</span>
                <div className='flex shrink-0 items-center gap-2'>
                  <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>{`${elapsedSeconds}s`}</span>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='border-0 bg-white/70 hover:bg-white'
                    onClick={onOpenLogDialog}
                    disabled={!liveTaskId}
                    aria-label={t("build.openCurrentLog")}
                    title={t("build.openCurrentLog")}>
                    <FileText className='h-5 w-5' />
                  </Button>
                  <Button
                    variant='ghost'
                    onClick={onStopBuildTask}
                    disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
                    className='border-0 bg-white/70 text-red-600 hover:bg-red-50 hover:text-red-700'>
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

      <Card className='border-0 shadow-sm'>
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
                <Button variant='ghost' className='border-0 bg-slate-100 text-slate-800 hover:bg-slate-200' onClick={() => setRawConfigInput(generatedToml)} disabled={isBusy}>
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
                  <Button variant='ghost' className='h-11 px-5 text-base border-0 bg-slate-100 hover:bg-slate-200' onClick={() => setMorpheSettingsOpen(true)} disabled={isBusy}>
                    <Settings2 className='h-6 w-6' />
                    morphe-cli
                  </Button>
                  <Button variant='ghost' className='h-11 px-5 text-base border-0 bg-slate-100 hover:bg-slate-200' onClick={() => setPatchesSettingsOpen(true)} disabled={isBusy}>
                    <Package className='h-6 w-6' />
                    patches
                  </Button>
                </div>
              </section>

              <section className='space-y-3 pt-1'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='text-base font-semibold'>{t("settings.apps")}</h3>
                  <Button variant='ghost' className='h-11 px-5 text-base border-0 bg-slate-100 hover:bg-slate-200' onClick={appendApp} disabled={isBusy || appTemplateLoading}>
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
