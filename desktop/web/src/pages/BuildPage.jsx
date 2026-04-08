import { useEffect, useMemo, useState } from "react"
import { Boxes, Cloud, Code2, FileText, FlaskConical, Hammer, HardDrive, KeyRound, Package, Pencil, Play, Plus, Settings2, Smartphone, Square, SquareChevronRight } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent } from "../components/ui/card"
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
  onOpenGeneratedApkDir,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [customAppDialogOpen, setCustomAppDialogOpen] = useState(false)
  const [customAppNameDraft, setCustomAppNameDraft] = useState("")
  const [customAppPackageDraft, setCustomAppPackageDraft] = useState("")
  const isWorking = isBuildRunning || buildLaunchPending || isBuildStopping

  function formatBuildPreviewMessage(value) {
    let text = String(value || "").trim()
    if (!text) return ""
    text = text.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*/u, "")
    while (/^\[[^\]]+\]\s*/u.test(text)) {
      text = text.replace(/^\[[^\]]+\]\s*/u, "")
    }
    return text.trim()
  }

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
    const remoteRepoMatch = !folderLabel ? label.match(/^(.*?)(\s*\(([^()]+)\))\s*$/u) : null
    const mainLabel = remoteRepoMatch ? String(remoteRepoMatch[1] || "").trim() : label
    const rightLabel = folderLabel || (remoteRepoMatch ? String(remoteRepoMatch[3] || "").trim() : "")
    const Icon = kind === "remote-dev" ? FlaskConical : kind === "local-file" ? HardDrive : Cloud
    const iconClassName =
      kind === "remote-dev"
        ? "h-3.5 w-3.5 text-amber-600"
        : kind === "local-file"
          ? "h-3.5 w-3.5 text-slate-600 dark:text-slate-400"
          : "h-3.5 w-3.5 text-sky-600"

    return (
      <>
        <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
          <Icon className={iconClassName} />
          <span className='min-w-0'>
            <span className='block truncate'>{mainLabel}</span>
            {rightLabel ? <span className='block truncate text-xs text-muted-foreground'>{rightLabel}</span> : null}
          </span>
        </span>
      </>
    )
  }

  function resolveSourceLabels(item) {
    const label = String(item?.label || "").trim()
    const folderLabel = String(item?.folderLabel || "").trim()
    const remoteRepoMatch = !folderLabel ? label.match(/^(.*?)(\s*\(([^()]+)\))\s*$/u) : null
    const primary = remoteRepoMatch ? String(remoteRepoMatch[1] || "").trim() : label
    const secondary = folderLabel || (remoteRepoMatch ? String(remoteRepoMatch[3] || "").trim() : "")
    return { primary, secondary }
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

  const buildPreviewLine = useMemo(() => {
    const message = formatBuildPreviewMessage(liveLastLine)
    return message || t("build.waiting")
  }, [liveLastLine, t])

  const selectedMorpheItem = useMemo(
    () => (Array.isArray(morpheCliSelectOptions) ? morpheCliSelectOptions : []).find((item) => item?.value === morpheCliSelectValue) || null,
    [morpheCliSelectOptions, morpheCliSelectValue],
  )
  const selectedPatchesItem = useMemo(
    () => (Array.isArray(patchesSelectOptions) ? patchesSelectOptions : []).find((item) => item?.value === patchesSelectValue) || null,
    [patchesSelectOptions, patchesSelectValue],
  )
  const selectedKeystoreItem = useMemo(
    () => (Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).find((item) => item?.value === keystoreSelectValue) || null,
    [keystoreSelectOptions, keystoreSelectValue],
  )

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
    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
      <div className='flex items-center gap-2 text-lg font-semibold'>
        <Hammer className='h-5 w-5' />
        {t("build.title")}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='ghost'
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
            rawOverrideMode ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-100 dark:bg-slate-800",
          )}
          onClick={onToggleRawMode}
          disabled={isBusy}
        >
          <Code2 className='h-4 w-4' />
          {t("settings.raw")}
        </Button>
        <Button
          variant='ghost'
          className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
          className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
          onClick={appendApp}
          disabled={isBusy}
        >
          <Plus className='h-4 w-4' />
          {t("settings.loadPresets")}
        </Button>
      </div>
    </div>
    <Card className='rounded-xl bg-white dark:bg-card text-card-foreground border border-slate-200 dark:border-slate-700 shadow-sm'>
      <CardContent className='space-y-6 py-5'>
        {rawOverrideMode ? (
          <div className='space-y-2'>
          
            <Textarea
              id='raw-toml'
              className='min-h-[340px] font-mono text-xs'
              value={rawConfigInput}
              onChange={(event) => setRawConfigInputValue(event.target.value)}
              spellCheck={false}
            />
          </div>
        ) : (
          <div className='space-y-6'>
            <section className='space-y-3'>
              <div className='space-y-2'>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                  <p className='text-sm text-slate-700 dark:text-slate-300'>CLI 版本</p>
                  <p className='text-sm text-slate-700 dark:text-slate-300'>Patches 檔案</p>
                  <p className='text-sm text-slate-700 dark:text-slate-300'>keystore</p>
                </div>

                <div className='grid grid-cols-1 items-center gap-3 md:grid-cols-3'>
                  <Select value={morpheCliSelectValue} onValueChange={onChangeMorpheCliSelect}>
                    <SelectTrigger className='h-11 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
                      <span className='inline-flex items-center gap-2 whitespace-nowrap  pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                        <SquareChevronRight className='h-3.5 w-3.5' />
                      </span>
                      <span className='pointer-events-none flex min-w-0 flex-1 flex-col items-start px-3 text-left leading-tight'>
                        <span className='block min-w-0 truncate text-sm font-semibold'>{resolveSourceLabels(selectedMorpheItem).primary}</span>
                        <span className='block min-w-0 truncate text-xs text-muted-foreground'>{resolveSourceLabels(selectedMorpheItem).secondary}</span>
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

                  <Select value={patchesSelectValue} onValueChange={onChangePatchesSelect}>
                    <SelectTrigger className='h-11 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
                      <span className='inline-flex items-center gap-2 whitespace-nowrap  pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                        <Boxes className='h-3.5 w-3.5' />
                      </span>
                      <span className='pointer-events-none flex min-w-0 flex-1 flex-col items-start px-3 text-left leading-tight'>
                        <span className='block min-w-0 truncate text-sm font-semibold'>{resolveSourceLabels(selectedPatchesItem).primary}</span>
                        <span className='block min-w-0 truncate text-xs text-muted-foreground'>{resolveSourceLabels(selectedPatchesItem).secondary}</span>
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

                  <Select value={keystoreSelectValue} onValueChange={onChangeKeystoreSelect}>
                    <SelectTrigger className='h-11 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
                      <span className='inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300'>
                        <KeyRound className='h-3.5 w-3.5' />
                      </span>
                      <span className='pointer-events-none min-w-0 flex-1 truncate px-3 text-left text-xs text-muted-foreground'>
                        {String(selectedKeystoreItem?.label || "").trim() || t("settings.noKeystore")}
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
                              <HardDrive className='h-3.5 w-3.5 text-slate-600 dark:text-slate-400' />
                              <span className='min-w-0 truncate'>{item.label}</span>
                            </span>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                </div>
              </div>
            </section>

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
                            className={cn(
                              "h-5 w-5 rounded-sm object-contain transition-all",
                              enabled ? "" : "grayscale opacity-55 saturate-0",
                            )}
                          />
                        ) : (
                          <Smartphone className='h-5 w-5 text-muted-foreground' />
                        )}
                        <span className='font-medium'>{app.displayName || app.name || "app-name"}</span>
                        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", enabled ? "bg-[#87d369]" : "bg-slate-300 dark:bg-slate-600")} />
                      </button>
                      <button
                        type='button'
                        className='inline-flex items-center justify-center border-l border-black/10 px-2 transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
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
                  className='inline-flex h-[42px] items-center gap-2 rounded-md bg-slate-50 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
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

        <div className='sticky bottom-0 z-10 mt-2 rounded-md bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85'>
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
                        ? "bg-sky-200 hover:bg-sky-300 dark:bg-sky-700/60 dark:hover:bg-sky-600/70"
                        : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600",
                    )}
                  />
                ))}
              </div>
              <span className='shrink-0 text-xs text-muted-foreground'>{isBuildStopping ? t("build.stopping") : t("dialog.running")}</span>
              <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>{buildPreviewLine}</span>
              <div className='flex shrink-0 items-center gap-2'>
                <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>{`${elapsedSeconds}s`}</span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='border-0 bg-white/70 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-700'
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
                  className='border-0 bg-white/70 text-red-600 hover:bg-red-50 hover:text-red-700 dark:bg-slate-800/80 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300'
                >
                  <Square className='h-5 w-5' />
                  {isBuildStopping ? t("build.stopping") : t("build.stop")}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className='w-full border-0 shadow-none bg-slate-700 text-white hover:bg-slate-600 dark:bg-slate-300 dark:text-slate-900 dark:hover:bg-slate-200'
              variant='default'
              onClick={onBuildPrimaryAction}
            >
              <Play className='h-5 w-5' />
              {t("build.start")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>

    <div className='mb-3 mt-4 flex items-center gap-2 text-lg font-semibold'>
      <Package className='h-5 w-5' />
      已產生 APK
    </div>
    <Card className='rounded-xl bg-white dark:bg-card text-card-foreground border border-slate-200 dark:border-slate-700 shadow-sm'>
      <CardContent className='space-y-4 py-5'>
        {buildGeneratedApksLoading ? (
          <p className='text-sm text-muted-foreground'>載入中...</p>
        ) : generatedApkGroups.length === 0 ? (
          <p className='text-sm text-muted-foreground'>目前沒有已完成打包的 APK 產物。</p>
        ) : (
          <div className='space-y-3'>
            {generatedApkGroups.map(([groupKey, items]) => {
              const groupIcon = resolveGeneratedApkGroupIcon(groupKey)
              return (
                <div key={`generated-apk-group-${groupKey}`} className='rounded-md p-2.5'>
                  <div className='mb-2 inline-flex items-center gap-2 text-sm font-semibold break-all'>
                    {hasText(groupIcon) ? (
                      <img
                        src={groupIcon}
                        alt={groupKey}
                        className='h-4 w-4 rounded-sm object-contain grayscale opacity-70 saturate-0 dark:invert dark:brightness-200 dark:opacity-90'
                      />
                    ) : (
                      <Package className='h-4 w-4 text-muted-foreground' />
                    )}
                    <span>{groupKey}</span>
                  </div>
                  <div className='space-y-1'>
                    {items.map((item) => (
                      <button
                        type='button'
                        key={`${item.taskId}:${item.relativePath}:${item.fileName}`}
                        className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted/40'
                        onClick={() => {
                          if (typeof onOpenGeneratedApkDir === "function") {
                            onOpenGeneratedApkDir(item)
                          }
                        }}
                        title='打開此 APK 所在資料夾'
                        aria-label='打開此 APK 所在資料夾'
                      >
                        <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
                          <Package className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                          <span className='min-w-0 truncate'>{item.fileName}</span>
                        </span>
                        <span className='shrink-0 text-xs text-muted-foreground'>{formatBytes(item.sizeBytes)}</span>
                        <span className='shrink-0 text-xs text-muted-foreground'>{formatApkModifiedAt(item.modifiedAt)}</span>
                      </button>
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
