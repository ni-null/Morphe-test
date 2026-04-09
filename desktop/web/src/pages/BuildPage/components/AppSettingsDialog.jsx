import { useEffect, useState } from "react"
import {
  FolderOpen,
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
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../../components/ui/select"
import { cn } from "../../../lib/utils"

const TAB_PATCHES = "patches"
const TAB_APK_SOURCE = "apk-source"

export default function AppSettingsDialog({
  open,
  onOpenChange,
  t,
  locale,
  editingApp,
  onBrowseAppLocalApkPath,
  updateApp,
  hasText,
  appPatchOptions,
  appVersionOptions,
  appPatchLoadingId,
  loadAppPatchOptions,
  appVerAutoValue,
  appVersionError,
  appPatchError,
  appUnsupportedPatches,
  getPatchTranslation,
  toggleAppPatch,
}) {
  const [activeTab, setActiveTab] = useState(TAB_PATCHES)

  useEffect(() => {
    if (!open) return
    setActiveTab(TAB_PATCHES)
  }, [open, editingApp?.id])

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
            <div className='inline-flex rounded-md bg-muted p-1'>
              <button
                type='button'
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm transition-colors",
                  activeTab === TAB_PATCHES ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveTab(TAB_PATCHES)}>
                {t("app.tabPatches")}
              </button>
              <button
                type='button'
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm transition-colors",
                  activeTab === TAB_APK_SOURCE ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setActiveTab(TAB_APK_SOURCE)}>
                {t("app.tabApkSource")}
              </button>
            </div>

            {activeTab === TAB_APK_SOURCE ? (
              <div className='space-y-3 rounded-md border bg-muted/20 p-3'>
                <div className='space-y-1'>
                  {(() => {
                    const versionMeta = appVersionOptions[editingApp.id] || {}
                    const configuredVer = String(editingApp.ver || "").trim()
                    const knownVersions = Array.isArray(versionMeta.versions) ? versionMeta.versions.map((value) => String(value)) : []
                    const mppName = String(versionMeta.patchFileName || appPatchOptions[editingApp.id]?.patchFileName || "").trim() || t("app.notLoaded")
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
                          <SelectItem value={appVerAutoValue}>{locale === "zh-TW" ? "auto（推薦）" : "auto (Recommended)"}</SelectItem>
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
                          <div className='mt-1 border-t px-2 py-1.5 text-xs text-muted-foreground break-all'>
                            {t("app.basedOnMpp", { name: mppName })}
                          </div>
                        </SelectContent>
                      </Select>
                    )
                  })()}
                  {appVersionError ? <p className='text-xs text-muted-foreground break-all'>{appVersionError}</p> : appVersionOptions[editingApp.id]?.any ? <p className='text-xs text-muted-foreground break-all'>{t("app.patchAnyHint")}</p> : null}
                </div>

                <div className='space-y-1'>
                  <div className='flex items-center justify-between gap-2'>
                    <Label htmlFor={`${editingApp.id}-local-apk-custom`}>{locale === "zh-TW" ? "自訂檔案路徑（優先）" : "Custom APK path (priority)"}</Label>
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
                    placeholder={locale === "zh-TW" ? "有填則使用本地 APK；留空則走 remote 下載" : "When set, use local APK; when empty, use remote download"}
                  />
                </div>

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
              </div>
            ) : (
              <div className='space-y-2 rounded-md border bg-muted/20 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs text-muted-foreground'>{t("app.availablePatches")}</p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => loadAppPatchOptions(editingApp)}
                    disabled={appPatchLoadingId === editingApp.id}
                    title={t("action.refresh")}
                    aria-label={t("action.refresh")}>
                    {appPatchLoadingId === editingApp.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                    {t("action.refresh")}
                  </Button>
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
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
