import { useEffect, useState } from "react"
import {
  FolderOpen,
  Loader2,
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
  appPatchStage,
  loadAppPatchOptions,
  appVerAutoValue,
  appVersionError,
  appPatchError,
  appUnsupportedPatches,
  getPatchTranslation,
  toggleAppPatch,
}) {
  const [activeTab, setActiveTab] = useState(TAB_PATCHES)
  const isCustomMode = String(editingApp?.patchesMode || "").trim().toLowerCase() === "custom"
  const patchEntries = appPatchOptions[editingApp?.id]?.entries || []
  const patchCount = patchEntries.length
  const patchMppName =
    String(appPatchOptions[editingApp?.id]?.patchFileName || appVersionOptions[editingApp?.id]?.patchFileName || "").trim() || t("app.notLoaded")
  const showPatchBusy = appPatchStage === "loading" || appPatchStage === "resolving"
  const patchBusyText = appPatchStage === "resolving" ? t("app.patchResolving") : t("app.patchLoading")

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
              <div className='space-y-3 rounded-md bg-muted/20 p-3'>
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
                  <Label htmlFor={`${editingApp.id}-local-apk-custom`}>{locale === "zh-TW" ? "自訂檔案路徑（優先）" : "Custom APK path (priority)"}</Label>
                  <div className='relative'>
                    <Input
                      id={`${editingApp.id}-local-apk-custom`}
                      value={editingApp.localApkCustomPath || ""}
                      onChange={(event) => updateApp(editingApp.id, { localApkCustomPath: event.target.value })}
                      placeholder={locale === "zh-TW" ? "有填則使用本地 APK；留空則走 remote 下載" : "When set, use local APK; when empty, use remote download"}
                      className='pr-11'
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={onBrowseAppLocalApkPath}
                      title={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}
                      aria-label={locale === "zh-TW" ? "選擇本地 APK 路徑" : "Select local APK path"}
                      className='absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'>
                      <FolderOpen className='h-4 w-4' />
                    </Button>
                  </div>
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
              <div className='space-y-2 rounded-md bg-muted/20 p-3'>
                {showPatchBusy ? (
                  <div className='flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background/70'>
                    <Loader2 className='h-12 w-12 animate-spin text-slate-500' />
                    <p className='text-sm font-medium'>{patchBusyText}</p>
                  </div>
                ) : (
                  <>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-xs text-muted-foreground'>
                    {appPatchError
                      ? appPatchError
                      : locale === "zh-TW"
                        ? `共 ${patchCount} 項 基於 ${patchMppName}`
                        : `${patchCount} items · based on ${patchMppName}`}
                  </p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      if (isCustomMode) {
                        updateApp(editingApp.id, { patchesMode: "default" })
                        return
                      }
                      void loadAppPatchOptions(editingApp, { applyDefaultSelection: true })
                    }}
                    disabled={appPatchLoadingId === editingApp.id}
                    title={t("app.customPatchesToggle")}
                    aria-label={t("app.customPatchesToggle")}>
                    {appPatchLoadingId === editingApp.id ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                      <span
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          String(editingApp.patchesMode || "").trim().toLowerCase() === "custom" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600",
                        )}
                      />
                    )}
                    {t("app.customPatchesToggle")}
                  </Button>
                </div>

                <div className='space-y-1'>
                  {isCustomMode ? null : (
                    <p className='text-xs text-muted-foreground'>{t("app.patchesReadOnlyHint")}</p>
                  )}
                </div>

                <div className='max-h-[260px] space-y-2 overflow-auto rounded-md border bg-background p-2'>
                  {patchEntries.length > 0 || (isCustomMode && (appUnsupportedPatches[editingApp.id] || []).length > 0) ? (
                    <>
                      {patchEntries.map((entry) => {
                        const patchName = String(entry?.name || "").trim()
                        const patchDescription = String(entry?.description || "").trim()
                        const translatedPatch = getPatchTranslation(locale, patchName, patchDescription)
                        const selectedInCustomMode =
                          Array.isArray(editingApp.patches) &&
                          editingApp.patches.map((value) => String(value || "").trim().toLowerCase()).includes(patchName.toLowerCase())
                        const selectedInDefaultMode =
                          entry && (entry.enabled === true || (typeof entry.enabled === "string" && entry.enabled.trim().toLowerCase() === "true"))
                        const selected = isCustomMode ? selectedInCustomMode : selectedInDefaultMode
                        return (
                          <label
                            key={`${editingApp.id}-patch-${entry.index}`}
                            className={cn(
                              "flex items-start gap-3 rounded-md bg-muted/40 px-3 py-2.5 text-sm transition-colors",
                              isCustomMode ? "hover:bg-muted/60" : "",
                            )}>
                            <Checkbox
                              checked={selected}
                              disabled={!isCustomMode}
                              onCheckedChange={(checked) => {
                                if (!isCustomMode) return
                                toggleAppPatch(editingApp.id, patchName, checked === true)
                              }}
                              className='mt-0.5'
                            />
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
                      {isCustomMode
                        ? (appUnsupportedPatches[editingApp.id] || []).map((patchName) => {
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
                          })
                        : null}
                    </>
                  ) : (
                    <p className='text-xs text-muted-foreground'>{t("app.noPatchList")}</p>
                  )}
                </div>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
