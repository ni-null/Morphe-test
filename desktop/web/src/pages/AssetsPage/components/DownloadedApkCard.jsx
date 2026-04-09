import { ChevronDown, FolderOpen, Loader2, Package, Trash2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card"

export default function DownloadedApkCard({
  t,
  onOpenAssetsDir,
  apkGroups,
  sectionMetaMap,
  hasText,
  apkExpandedByGroup,
  setApkExpandedByGroup,
  formatBytes,
  openConfirmDialog,
  apkDeletePath,
}) {
  return (
    <Card className='border-0 bg-card shadow-sm'>
      <CardHeader className='py-3'>
        <CardTitle className='text-base flex items-center justify-between gap-2'>
          <span className='inline-flex items-center gap-2'>
            <Package className='h-4 w-4' />
            {t("assets.apk")}
          </span>
          <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => onOpenAssetsDir("downloads")} aria-label={t("dialog.openTaskOutput")} title={t("dialog.openTaskOutput")}>
            <FolderOpen className='h-4 w-4' />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {apkGroups.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t("assets.noApkFiles")}</p>
        ) : (
          <div className='assets-scroll max-h-72 space-y-2 overflow-y-auto pr-1'>
            {apkGroups.map(([groupKey, files]) => {
              const meta = sectionMetaMap[String(groupKey || "").toLowerCase()] || null
              const icon = hasText(meta?.icon) ? String(meta.icon) : ""
              const packageName = hasText(meta?.packageName) ? String(meta.packageName) : t("assets.unknownPackage")
              const title = hasText(meta?.label) ? String(meta.label) : `[${groupKey}]`
              const key = String(groupKey || "__unknown__")
              const expanded = apkExpandedByGroup[key] === true
              return (
                <div key={`apk-group-${groupKey}`} className='space-y-2 rounded-xl bg-slate-100/85 p-2.5 dark:bg-slate-800/70'>
                  <button
                    type='button'
                    className='flex h-10 w-full items-center gap-2 rounded-lg border-0 bg-transparent px-2 text-left hover:bg-slate-100/80 dark:hover:bg-slate-700/70'
                    onClick={() => {
                      setApkExpandedByGroup((prev) => ({
                        ...prev,
                        [key]: !expanded,
                      }))
                    }}>
                    {hasText(icon) ? <img src={icon} alt={title} className='h-5 w-5 rounded-sm object-contain' /> : null}
                    <span className='min-w-0 truncate text-sm font-semibold'>{title}</span>
                    <span className='min-w-0 truncate text-sm text-muted-foreground'>{packageName}</span>
                    <span className='ml-auto shrink-0 text-xs text-muted-foreground'>{t("assets.versionCount", { count: files.length })}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded ? (
                    <div className='space-y-1 rounded-lg bg-slate-100/80 p-1.5 dark:bg-slate-800/75'>
                      {files.map((file) => (
                        <div key={`apk-file-${file.fullPath}`} className='flex items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 hover:bg-slate-200/80 dark:hover:bg-slate-700/70'>
                          <span className='min-w-0 flex-1 truncate text-sm'>{file.name}</span>
                          <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                          <button
                            type='button'
                            className='inline-flex h-5 w-5 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                            onClick={() => openConfirmDialog("delete-apk-file", t("confirm.deleteApkTitle"), t("confirm.deleteApkDesc", { path: file.relativePath }), file)}
                            aria-label={t("confirm.deleteApkTitle")}
                            title={t("confirm.deleteApkTitle")}
                            disabled={String(apkDeletePath || "") === String(file.fullPath || "")}>
                            {String(apkDeletePath || "") === String(file.fullPath || "") ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : <Trash2 className='h-3.5 w-3.5' />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
