import { useEffect, useMemo, useState } from "react"
import { Boxes, Cloud, Code2, FileText, FlaskConical, Hammer, HardDrive, KeyRound, Package, Pencil, Play, Plus, Settings2, Smartphone, Square, SquareChevronRight } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
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
  setRawConfigInput,
  generatedToml,
  rawConfigInput,
  setRawConfigInputValue,
  morpheCliSelectValue,
  morpheCliSelectOptions,
  onChangeMorpheCliSelect,
  patchesSelectValue,
  patchesSelectOptions,
  onChangePatchesSelect,
  keystoreSelectValue,
  keystoreSelectOptions,
  onChangeKeystoreSelect,
  appendApp,
  onAppendCustomApp,
  apps,
  updateApp,
  getPackageIcon,
  hasText,
  setAppSettingsId,
  setAppSettingsOpen,
  buildGeneratedApks,
  buildGeneratedApksLoading,
  formatBytes,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [customAppDialogOpen, setCustomAppDialogOpen] = useState(false)
  const [customAppNameDraft, setCustomAppNameDraft] = useState("")
  const [customAppPackageDraft, setCustomAppPackageDraft] = useState("")
  const isWorking = isBuildRunning || buildLaunchPending || isBuildStopping

  function onCloseCustomAppDialog() {
    setCustomAppDialogOpen(false)
    setCustomAppNameDraft("")
    setCustomAppPackageDraft("")
  }

  function onConfirmAppendCustomApp() {
    const name = String(customAppNameDraft || "").trim()
    const packageName = String(customAppPackageDraft || "").trim()
    if (!name || !packageName) return
    const added = typeof onAppendCustomApp === "function" ? onAppendCustomApp(name, packageName) : false
    if (added !== false) {
      onCloseCustomAppDialog()
    }
  }

  function renderSourceOption(item) {
    const kind = String(item?.kind || "").trim().toLowerCase()
    const label = String(item?.label || "").trim()
    const folderLabel = String(item?.folderLabel || "").trim()
    const Icon = kind === "remote-dev" ? FlaskConical : kind === "local-file" ? HardDrive : Cloud
    const iconClassName =
      kind === "remote-dev"
        ? "h-3.5 w-3.5 text-amber-600"
        : kind === "local-file"
          ? "h-3.5 w-3.5 text-slate-600"
          : "h-3.5 w-3.5 text-sky-600"

    return (
      <>
        <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
          <Icon className={iconClassName} />
          <span className='min-w-0 truncate'>{label}</span>
        </span>
        {kind === "local-file" && folderLabel ? <span className='ml-auto shrink-0 text-xs text-muted-foreground'>{`(${folderLabel})`}</span> : null}
      </>
    )
  }

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

  function inferApkPackageGroup(item) {
    const relativePath = String(item?.relativePath || "")
      .trim()
      .replace(/\\/g, "/")
    if (relativePath) {
      const first = String(relativePath.split("/")[0] || "").trim()
      if (first && !first.toLowerCase().endsWith(".apk")) return first
    }
    const fileName = String(item?.fileName || "").trim()
    const prefix = String(fileName.split("-")[0] || "")
      .trim()
      .toLowerCase()
    return prefix || "unknown"
  }

  function formatApkModifiedAt(value) {
    const text = String(value || "").trim()
    if (!text) return ""
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) return text
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    const hh = String(date.getHours()).padStart(2, "0")
    const mm = String(date.getMinutes()).padStart(2, "0")
    return `${y}/${m}/${d} ${hh}:${mm}`
  }

  function resolveGeneratedApkGroupIcon(groupKey) {
    const mapped = String(getPackageIcon(groupKey) || "").trim()
    if (mapped) return mapped
    const normalized = String(groupKey || "")
      .trim()
      .toLowerCase()
    if (!/^[a-z0-9_-]+$/u.test(normalized)) return ""
    return `./assets/apps/${normalized.replace(/_/g, "-")}.svg`
  }

  const generatedApkGroups = useMemo(() => {
    const list = Array.isArray(buildGeneratedApks) ? buildGeneratedApks : []
    const buckets = new Map()
    for (const item of list) {
      const key = inferApkPackageGroup(item)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(item)
    }
    return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
  }, [buildGeneratedApks])

  return (
    <>
    <Card className='border-0 shadow-sm'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='flex items-center gap-2'>
            <Hammer className='h-5 w-5' />
            {t("build.title")}
          </CardTitle>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='ghost'
              className={cn(
                "h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200",
                rawOverrideMode ? "bg-slate-200" : "bg-slate-100",
              )}
              onClick={onToggleRawMode}
              disabled={isBusy}
            >
              <Code2 className='h-4 w-4' />
              {t("settings.raw")}
            </Button>
            <Button
              variant='ghost'
              className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200'
              onClick={() => setConfigPathDialogOpen(true)}
              disabled={isBusy}
              aria-label={t("dialog.configPathTitle")}
              title={t("dialog.configPathTitle")}
            >
              <Pencil className='h-4 w-4' />
              {t("settings.path")}
            </Button>
            <Button
              variant='ghost'
              className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200'
              onClick={appendApp}
              disabled={isBusy}
            >
              <Plus className='h-4 w-4' />
              {t("settings.loadPresets")}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {rawOverrideMode ? (
          <div className='space-y-2'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label htmlFor='raw-toml'>{t("settings.rawInput")}</Label>
              <Button
                variant='ghost'
                className='border-0 bg-slate-100 text-slate-800 hover:bg-slate-200'
                onClick={() => setRawConfigInput(generatedToml)}
                disabled={isBusy}
              >
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
              <h3 className='text-base font-semibold'>來源設定</h3>
              <div className='flex w-full items-center gap-2'>
                <div className='min-w-0 flex-1'>
                  <Select value={morpheCliSelectValue} onValueChange={onChangeMorpheCliSelect}>
                    <SelectTrigger className='h-10 w-full border-0 bg-slate-100 hover:bg-slate-100'>
                      <span className='inline-flex items-center gap-2 whitespace-nowrap border-r border-slate-300 pr-2 text-xs font-medium text-slate-700'>
                        <SquareChevronRight className='h-3.5 w-3.5' />
                      </span>
                      <span className='pointer-events-none min-w-0 truncate px-2 text-left'>
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent position='popper' side='bottom' align='start'>
                      {(Array.isArray(morpheCliSelectOptions) ? morpheCliSelectOptions : []).map((item) => (
                        <SelectItem key={`morphe-cli-select-${item.value}`} value={item.value}>
                          {renderSourceOption(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='min-w-0 flex-1'>
                  <Select value={patchesSelectValue} onValueChange={onChangePatchesSelect}>
                    <SelectTrigger className='h-10 w-full border-0 bg-slate-100 hover:bg-slate-100'>
                      <span className='inline-flex items-center gap-2 whitespace-nowrap border-r border-slate-300 pr-2 text-xs font-medium text-slate-700'>
                        <Boxes className='h-3.5 w-3.5' />
                      </span>
                      <span className='pointer-events-none min-w-0 truncate px-2 text-left'>
                        <SelectValue />
                      </span>
                    </SelectTrigger>
                    <SelectContent position='popper' side='bottom' align='start'>
                      {(Array.isArray(patchesSelectOptions) ? patchesSelectOptions : []).map((item) => (
                        <SelectItem key={`patches-select-${item.value}`} value={item.value}>
                          {renderSourceOption(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select value={keystoreSelectValue} onValueChange={onChangeKeystoreSelect}>
                  <SelectTrigger
                    className='h-10 w-10 shrink-0 justify-center border-0 bg-slate-100 px-0 text-slate-700 hover:bg-slate-100 [&>svg]:hidden'
                    aria-label={t("settings.keystoreSelectPlaceholder")}
                    title={t("settings.keystoreSelectPlaceholder")}
                  >
                    <KeyRound className='h-4 w-4' />
                    <span className='sr-only'>
                      <SelectValue placeholder={t("settings.keystoreSelectPlaceholder")} />
                    </span>
                  </SelectTrigger>
                  <SelectContent position='popper' side='bottom' align='start'>
                    {(Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).length === 0 ? (
                      <SelectItem value='__NONE__' disabled>
                        {t("settings.noKeystore")}
                      </SelectItem>
                    ) : (
                      (Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).map((item) => (
                        <SelectItem key={`keystore-select-${item.value}`} value={item.value}>
                          <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
                            <HardDrive className='h-3.5 w-3.5 text-slate-600' />
                            <span className='min-w-0 truncate'>{item.label}</span>
                          </span>
                          {item.folderLabel ? <span className='ml-auto shrink-0 text-xs text-muted-foreground'>{`(${item.folderLabel})`}</span> : null}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className='space-y-2'>
              <div className='flex flex-wrap gap-2'>
                {apps.map((app) => {
                  const enabled = app.mode !== "false"
                  return (
                    <div
                      key={`build-app-enable-${app.id}`}
                      className={cn(
                        "inline-flex items-stretch overflow-hidden rounded-md text-sm transition-colors",
                 "bg-slate-100 text-slate-600",
                      )} 
                    >
                      <button
                        type='button'
                        className='inline-flex items-center gap-2 px-3 py-2 transition-colors '
                        onClick={() => updateApp(app.id, { mode: enabled ? "false" : "remote" })}
                      >
                        {hasText(getPackageIcon(app.packageName)) ? (
                          <img
                            src={getPackageIcon(app.packageName)}
                            alt={app.displayName || app.name || "app"}
                            className='h-5 w-5 rounded-sm object-contain'
                          />
                        ) : (
                          <Smartphone className='h-5 w-5 text-muted-foreground' />
                        )}
                        <span className='font-medium'>{app.displayName || app.name || "app-name"}</span>
                        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", enabled ? "bg-[#87d369]" : "bg-slate-300")} />
                      </button>
                      <button
                        type='button'
                        className='inline-flex items-center justify-center border-l border-black/10 px-2 transition-colors hover:bg-black/5'
                        onClick={() => {
                          setAppSettingsId(app.id)
                          setAppSettingsOpen(true)
                        }}
                        aria-label={`${app.displayName || app.name || "app"} settings`}
                        title={`${app.displayName || app.name || "app"} settings`}
                      >
                        <Settings2 className='h-4 w-4' />
                      </button>
                    </div>
                  )
                })}
                <button
                  type='button'
                  className='inline-flex h-[42px] items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100'
                  onClick={() => setCustomAppDialogOpen(true)}
                  disabled={isBusy}
                  title={t("dialog.addAppTitle")}
                  aria-label={t("dialog.addAppTitle")}
                >
                  <Plus className='h-4 w-4' />
                </button>
              </div>
            </section>
          </div>
        )}

        <div className='sticky bottom-0 z-10 rounded-md bg-background/95 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/85'>
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
                      stage.state === "done" ? "bg-sky-200 hover:bg-sky-300" : "bg-slate-200 hover:bg-slate-300",
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
                  title={t("build.openCurrentLog")}
                >
                  <FileText className='h-5 w-5' />
                </Button>
                <Button
                  variant='ghost'
                  onClick={onStopBuildTask}
                  disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
                  className='border-0 bg-white/70 text-red-600 hover:bg-red-50 hover:text-red-700'
                >
                  <Square className='h-5 w-5' />
                  {isBuildStopping ? t("build.stopping") : t("build.stop")}
                </Button>
              </div>
            </div>
          ) : (
            <Button className='w-full' variant='default' onClick={onBuildPrimaryAction}>
              <Play className='h-5 w-5' />
              {t("build.start")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

    <Card className='border-0 shadow-sm'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Package className='h-5 w-5' />
          已產生 APK
        </CardTitle>
      </CardHeader>
      <CardContent>
        {buildGeneratedApksLoading ? (
          <p className='text-sm text-muted-foreground'>載入中...</p>
        ) : generatedApkGroups.length === 0 ? (
          <p className='text-sm text-muted-foreground'>目前沒有已完成打包的 APK 產物。</p>
        ) : (
          <div className='space-y-3'>
            {generatedApkGroups.map(([groupKey, items]) => {
              const groupIcon = resolveGeneratedApkGroupIcon(groupKey)
              return (
                <div key={`generated-apk-group-${groupKey}`} className='rounded-md bg-muted/35 p-2.5'>
                  <div className='mb-2 inline-flex items-center gap-2 text-sm font-semibold break-all'>
                    {hasText(groupIcon) ? (
                      <img
                        src={groupIcon}
                        alt={groupKey}
                        className='h-4 w-4 rounded-sm object-contain'
                      />
                    ) : (
                      <Package className='h-4 w-4 text-muted-foreground' />
                    )}
                    <span>{groupKey}</span>
                  </div>
                  <div className='space-y-1'>
                    {items.map((item) => (
                      <div key={`${item.taskId}:${item.relativePath}:${item.fileName}`} className='flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40'>
                        <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
                          <Package className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                          <span className='min-w-0 truncate'>{item.fileName}</span>
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground'>{formatBytes(item.sizeBytes)}</span>
                        <span className='shrink-0 text-xs text-muted-foreground'>{formatApkModifiedAt(item.modifiedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
    <Dialog open={customAppDialogOpen} onOpenChange={(open) => (!open ? onCloseCustomAppDialog() : setCustomAppDialogOpen(true))}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t("dialog.addAppTitle")}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='build-custom-app-name'>{t("dialog.addAppNameLabel")}</Label>
            <Input
              id='build-custom-app-name'
              value={customAppNameDraft}
              onChange={(event) => setCustomAppNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                onConfirmAppendCustomApp()
              }}
              placeholder={t("dialog.addAppNamePlaceholder")}
              autoFocus
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='build-custom-app-package'>{t("dialog.addAppPackageLabel")}</Label>
            <Input
              id='build-custom-app-package'
              value={customAppPackageDraft}
              onChange={(event) => setCustomAppPackageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                onConfirmAppendCustomApp()
              }}
              placeholder={t("dialog.addAppPackagePlaceholder")}
            />
          </div>
          <div className='flex items-center justify-end gap-2'>
            <Button variant='ghost' onClick={onCloseCustomAppDialog}>
              {t("action.cancel")}
            </Button>
            <Button onClick={onConfirmAppendCustomApp} disabled={!hasText(customAppNameDraft) || !hasText(customAppPackageDraft)}>
              {t("action.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
