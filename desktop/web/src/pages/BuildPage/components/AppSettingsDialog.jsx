import {
  Cloud,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Settings2,
  Smartphone,
} from "lucide-react"
import { Badge } from "../../../components/ui/badge"
import { Button } from "../../../components/ui/button"
import { Checkbox } from "../../../components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../../components/ui/select"

export default function AppSettingsDialog({
  open,
  onOpenChange,
  t,
  locale,
  editingApp,
  appDlurlPopoverOpen,
  setAppDlurlPopoverOpen,
  appLocalApkFiles,
  appLocalApkDir,
  appLocalApkLoading,
  onRefreshAppLocalApkFiles,
  onBrowseAppLocalApkPath,
  updateApp,
  hasText,
  appPatchOptions,
  appVersionOptions,
  appVersionLoadingId,
  appPatchLoadingId,
  loadAppVersions,
  loadAppPatchOptions,
  appVerAutoValue,
  appVersionError,
  appPatchError,
  appUnsupportedPatches,
  getPatchTranslation,
  toggleAppPatch,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t("dialog.appSettings")}</DialogTitle>
          <DialogDescription>
            {editingApp
              ? `${editingApp.displayName || editingApp.name || t("dialog.noAppSelected")} · ${editingApp.packageName || "-"}`
              : t("dialog.noAppSelected")}
          </DialogDescription>
        </DialogHeader>

        {editingApp ? (
          <div className='space-y-3'>
            <div className='space-y-1'>
              <Popover open={appDlurlPopoverOpen} onOpenChange={setAppDlurlPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button type='button' variant='outline' className='w-full justify-start'>
                    <Link2 className='h-4 w-4' />
                    <span>{t("app.versionAndPatches")}</span>
                    <span className='mx-1 text-muted-foreground'>|</span>
                    {editingApp.mode === "local" ? <HardDrive className='h-4 w-4 text-amber-700' /> : <Cloud className='h-4 w-4 text-sky-700' />}
                    <span className='font-medium'>{editingApp.mode === "local" ? "local" : "remote"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent side='bottom' align='start' className='w-[460px] max-w-[calc(100vw-3rem)] space-y-3'>
                  <div className='space-y-1'>
                    <Label htmlFor={`${editingApp.id}-mode`}>mode</Label>
                    <Select
                      value={editingApp.mode === "local" ? "local" : "remote"}
                      onValueChange={(value) => {
                        if (value === "local") {
                          const firstPath = appLocalApkFiles.length > 0 ? String(appLocalApkFiles[0].fullPath || "") : ""
                          updateApp(editingApp.id, {
                            mode: "local",
                            localApkSelectedPath: hasText(editingApp.localApkSelectedPath) ? editingApp.localApkSelectedPath : firstPath,
                          })
                          return
                        }
                        updateApp(editingApp.id, { mode: "remote" })
                      }}>
                      <SelectTrigger id={`${editingApp.id}-mode`}>
                        <span className='inline-flex items-center gap-2'>
                          {editingApp.mode === "local" ? <HardDrive className='h-4 w-4 text-amber-700' /> : <Cloud className='h-4 w-4 text-sky-700' />}
                          <span>{editingApp.mode === "local" ? "local" : "remote"}</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='remote'>
                          <span className='inline-flex items-center gap-2'>
                            <Cloud className='h-4 w-4 text-sky-700' />
                            <span>remote</span>
                          </span>
                        </SelectItem>
                        <SelectItem value='local'>
                          <span className='inline-flex items-center gap-2'>
                            <HardDrive className='h-4 w-4 text-amber-700' />
                            <span>local</span>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {editingApp.mode === "local" ? (
                    <>
                      <div className='space-y-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <Label htmlFor={`${editingApp.id}-local-apk-select`}>{locale === "zh-TW" ? "本地 APK（已下載）" : "Local APK (downloaded)"}</Label>
                          <Button variant='ghost' size='icon' onClick={onRefreshAppLocalApkFiles} disabled={appLocalApkLoading}>
                            {appLocalApkLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                          </Button>
                        </div>
                        <p className='text-[11px] text-muted-foreground break-all'>
                          {locale === "zh-TW" ? "掃描路徑" : "Scan dir"}: {appLocalApkDir || "-"} ({appLocalApkFiles.length})
                        </p>
                        <Select
                          value={hasText(editingApp.localApkSelectedPath) ? editingApp.localApkSelectedPath : appLocalApkFiles[0]?.fullPath || "__NONE__"}
                          onValueChange={(value) => {
                            if (value === "__NONE__") return
                            updateApp(editingApp.id, { localApkSelectedPath: value })
                          }}>
                          <SelectTrigger id={`${editingApp.id}-local-apk-select`}>
                            <span className='truncate'>{locale === "zh-TW" ? "選擇本地 APK" : "Select local APK"}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {appLocalApkFiles.length === 0 ? (
                              <SelectItem value='__NONE__' disabled>
                                {locale === "zh-TW" ? "尚無可用 APK" : "No APK available"}
                              </SelectItem>
                            ) : (
                              appLocalApkFiles.map((file) => (
                                <SelectItem key={`app-local-apk-${file.fullPath}`} value={String(file.fullPath)}>
                                  {String(file.name || file.fileName || file.relativePath || file.fullPath)}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className='space-y-1'>
                        <div className='flex items-center justify-between gap-2'>
                          <Label htmlFor={`${editingApp.id}-local-apk-custom`}>{locale === "zh-TW" ? "自訂檔案路徑（優先）" : "Custom file path (override)"}</Label>
                          <Button
                            type='button'
                            variant='outline'
                            size='icon'
                            onClick={onBrowseAppLocalApkPath}
                            title={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}
                            aria-label={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}>
                            <FolderOpen className='h-4 w-4' />
                          </Button>
                        </div>
                        <Input
                          id={`${editingApp.id}-local-apk-custom`}
                          value={editingApp.localApkCustomPath || ""}
                          onChange={(event) => updateApp(editingApp.id, { localApkCustomPath: event.target.value })}
                          placeholder={locale === "zh-TW" ? "留空則使用上方已下載 APK" : "Leave empty to use selected downloaded APK"}
                        />
                      </div>
                    </>
                  ) : null}

                  {editingApp.mode !== "local" ? (
                    <>
                      <div className='space-y-1'>
                        <Label htmlFor={`${editingApp.id}-apkmirror`}>apkmirror-dlurl</Label>
                        <Input
                          id={`${editingApp.id}-apkmirror`}
                          value={editingApp.apkmirrorDlurl}
                          onChange={(event) => updateApp(editingApp.id, { apkmirrorDlurl: event.target.value })}
                          placeholder='https://www.apkmirror.com/apk/google-inc/youtube'
                        />
                      </div>

                      <div className='space-y-1'>
                        <Label htmlFor={`${editingApp.id}-uptodown`}>uptodown-dlurl</Label>
                        <Input
                          id={`${editingApp.id}-uptodown`}
                          value={editingApp.uptodownDlurl}
                          onChange={(event) => updateApp(editingApp.id, { uptodownDlurl: event.target.value })}
                          placeholder='https://youtube.en.uptodown.com/android'
                        />
                      </div>

                      <div className='space-y-1'>
                        <Label htmlFor={`${editingApp.id}-archive`}>archive-dlurl</Label>
                        <Input
                          id={`${editingApp.id}-archive`}
                          value={editingApp.archiveDlurl}
                          onChange={(event) => updateApp(editingApp.id, { archiveDlurl: event.target.value })}
                          placeholder='https://archive.org/...'
                        />
                      </div>
                    </>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>

            <div className='space-y-2 rounded-md border bg-muted/20 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-xs text-muted-foreground break-all'>
                  {t("app.basedOnMpp", {
                    name: String(appPatchOptions[editingApp.id]?.patchFileName || appVersionOptions[editingApp.id]?.patchFileName || "").trim() || t("app.notLoaded"),
                  })}
                </p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    loadAppVersions(editingApp)
                    loadAppPatchOptions(editingApp)
                  }}
                  disabled={appVersionLoadingId === editingApp.id || appPatchLoadingId === editingApp.id}
                  title={t("action.refresh")}
                  aria-label={t("action.refresh")}>
                  {appVersionLoadingId === editingApp.id || appPatchLoadingId === editingApp.id ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <RefreshCw className='h-4 w-4' />
                  )}
                  {t("action.refresh")}
                </Button>
              </div>

              <div className='grid gap-3 md:grid-cols-2'>
                <div className='space-y-1'>
                  {(() => {
                    const versionMeta = appVersionOptions[editingApp.id] || {}
                    const configuredVer = String(editingApp.ver || "").trim()
                    const knownVersions = Array.isArray(versionMeta.versions) ? versionMeta.versions.map((value) => String(value)) : []
                    const showUnsupportedConfiguredVer =
                      versionMeta.loaded === true && configuredVer.length > 0 && !versionMeta.any && !knownVersions.includes(configuredVer)
                    return (
                      <Select value={hasText(editingApp.ver) ? String(editingApp.ver) : appVerAutoValue} onValueChange={(value) => updateApp(editingApp.id, { ver: value === appVerAutoValue ? "" : value })}>
                        <SelectTrigger id={`${editingApp.id}-ver`}>
                          <span className='inline-flex min-w-0 items-center gap-2'>
                            <Smartphone className='h-4 w-4 text-sky-700' />
                            <span>ver</span>
                            <span className='text-muted-foreground'>|</span>
                            <span className='truncate font-medium'>{hasText(editingApp.ver) ? String(editingApp.ver) : "auto"}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={appVerAutoValue}>auto</SelectItem>
                          {showUnsupportedConfiguredVer ? (
                            <SelectItem value={configuredVer} disabled>
                              {configuredVer} ({locale === "zh-TW" ? "不相容，執行時會 fallback auto" : "incompatible, will fallback to auto at runtime"})
                            </SelectItem>
                          ) : null}
                          {(appVersionOptions[editingApp.id]?.versions || []).map((ver) => (
                            <SelectItem key={`${editingApp.id}-${ver}`} value={String(ver)}>
                              {String(ver)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  })()}
                  <p className='text-xs text-muted-foreground break-all'>
                    {appVersionError
                      ? appVersionError
                      : appVersionOptions[editingApp.id]?.any
                        ? t("app.patchAnyHint")
                        : `${locale === "zh-TW" ? "可用版本" : "Available versions"}: ${(appVersionOptions[editingApp.id]?.versions || []).length}`}
                  </p>
                </div>

                <div className='space-y-1'>
                  <Select
                    value={editingApp.patchesMode === "custom" ? "custom" : "default"}
                    onValueChange={(value) => {
                      const defaultNames = (appPatchOptions[editingApp.id]?.entries || [])
                        .filter((entry) => entry && entry.enabled === true)
                        .map((entry) => String(entry.name || "").trim())
                        .filter(Boolean)
                      const existingNames = Array.isArray(editingApp.patches) ? editingApp.patches.map((name) => String(name || "").trim()).filter(Boolean) : []
                      const nextNames = existingNames.length > 0 ? existingNames : defaultNames
                      updateApp(editingApp.id, {
                        patchesMode: value === "custom" ? "custom" : "default",
                        patches: value === "custom" ? nextNames : [],
                      })
                    }}>
                    <SelectTrigger id={`${editingApp.id}-patches-mode`}>
                      <span className='inline-flex min-w-0 items-center gap-2'>
                        <Settings2 className='h-4 w-4 text-sky-700' />
                        <span>patches_mode</span>
                        <span className='text-muted-foreground'>|</span>
                        <span className='truncate font-medium'>{editingApp.patchesMode === "custom" ? "custom" : "default"}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='default'>default</SelectItem>
                      <SelectItem value='custom'>custom</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    {appPatchError ? appPatchError : `${locale === "zh-TW" ? "可用補丁" : "Available patches"}: ${(appPatchOptions[editingApp.id]?.entries || []).length}`}
                  </p>
                </div>
              </div>

              {editingApp.patchesMode === "custom" ? (
                <div className='space-y-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <Label>custom patches</Label>
                    <Button type='button' variant='outline' size='sm' onClick={() => loadAppPatchOptions(editingApp, { applyDefaultSelection: true })} disabled={appPatchLoadingId === editingApp.id}>
                      {appPatchLoadingId === editingApp.id ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
                      {locale === "zh-TW" ? "使用預設" : "Use defaults"}
                    </Button>
                  </div>
                  <div className='max-h-[260px] space-y-2 overflow-auto rounded-md border bg-background p-2'>
                    {(appPatchOptions[editingApp.id]?.entries || []).length > 0 || (appUnsupportedPatches[editingApp.id] || []).length > 0 ? (
                      <>
                        {(appPatchOptions[editingApp.id]?.entries || []).map((entry) => {
                          const patchName = String(entry?.name || "").trim()
                          const patchDescription = String(entry?.description || "").trim()
                          const translatedPatch = getPatchTranslation(locale, patchName, patchDescription)
                          const selected =
                            Array.isArray(editingApp.patches) &&
                            editingApp.patches.map((value) => String(value || "").trim().toLowerCase()).includes(patchName.toLowerCase())
                          return (
                            <label key={`${editingApp.id}-patch-${entry.index}`} className='flex items-start gap-3 rounded-md bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/60'>
                              <Checkbox checked={selected} onCheckedChange={(checked) => toggleAppPatch(editingApp.id, patchName, checked === true)} className='mt-0.5' />
                              <span className='min-w-0 flex-1'>
                                <span className='flex items-center gap-2'>
                                  <span className='font-mono text-xs text-muted-foreground'>{entry.index}</span>
                                  <span className='break-words font-medium'>{translatedPatch.name}</span>
                                </span>
                                {hasText(translatedPatch.description) ? (
                                  <span className='mt-1 block whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground'>{translatedPatch.description}</span>
                                ) : null}
                              </span>
                            </label>
                          )
                        })}
                        {(appUnsupportedPatches[editingApp.id] || []).map((patchName) => {
                          const translatedPatch = getPatchTranslation(locale, patchName, "")
                          return (
                            <label key={`${editingApp.id}-patch-unsupported-${patchName}`} className='flex items-start gap-3 rounded-md bg-muted/25 px-3 py-2.5 text-sm opacity-75'>
                              <Checkbox checked={false} disabled className='mt-0.5' />
                              <span className='min-w-0 flex-1'>
                                <span className='flex items-center gap-2'>
                                  <span className='font-mono text-xs text-muted-foreground'>-</span>
                                  <span className='break-words line-through text-muted-foreground'>{translatedPatch.name}</span>
                                  <Badge variant='outline' className='text-[10px]'>
                                    {t("app.unsupported")}
                                  </Badge>
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </>
                    ) : (
                      <p className='text-xs text-muted-foreground'>{t("app.noPatchList")}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className='text-xs text-muted-foreground'>{t("app.defaultPatchHint")}</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
