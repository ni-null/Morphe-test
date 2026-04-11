import { Check, Download, FolderGit2, FolderOpen, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../../components/ui/select"
import ManageRepoDialog from "../AssetsPage/components/ManageRepoDialog"
import {
  MICROG_ADD_CUSTOM_REPO_VALUE,
  MICROG_LOCAL_SOURCE_VALUE,
  buildSourceMixedItems,
  formatPublishedAt,
  formatRepoPathOnly,
} from "../AssetsPage/utils/assetsPageUtils"
import { DEFAULT_MICROG_SOURCE_REPO } from "../../lib/app-constants"

export default function MircrogPage({
  t,
  hasText,
  formatBytes,
  loading,
  repo,
  repoOptions,
  repoDraft,
  setRepoDraft,
  sourceVersion,
  setSourceVersion,
  versions,
  localFiles,
  downloadingNames,
  onRefresh,
  onDownload,
  onSelectRepo,
  onAddRepo,
  onDeleteRepo,
  openConfirmDialog,
  mircrogDeleteName,
  onOpenSourceFile,
  onOpenAssetsDir,
}) {
  const [addRepoDialogType, setAddRepoDialogType] = useState("")
  const [addRepoBusy, setAddRepoBusy] = useState(false)
  const [repoMode, setRepoMode] = useState("remote")

  const mixedItems = buildSourceMixedItems(versions, localFiles, repo)

  async function onConfirmAddRepo() {
    if (addRepoBusy) return
    setAddRepoBusy(true)
    const ok = await onAddRepo()
    if (ok) {
      setRepoMode("remote")
      setAddRepoDialogType("")
    }
    setAddRepoBusy(false)
  }

  function onChangeRepo(value) {
    if (value === MICROG_ADD_CUSTOM_REPO_VALUE) {
      setAddRepoDialogType("engine")
      return
    }
    if (value === MICROG_LOCAL_SOURCE_VALUE) {
      setRepoMode("local")
      return
    }
    setRepoMode("remote")
    onSelectRepo(value)
  }

  return (
    <div className='space-y-4'>
      <section className='space-y-2'>
        <div className='flex items-center justify-between gap-2 px-1'>
          <h2 className='text-base font-semibold'>{t("mircrog.title")}</h2>
          <div className='flex items-center gap-1.5'>
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={onRefresh} title={t("action.refresh")} aria-label={t("action.refresh")}>
              {loading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-8 w-8'
              onClick={() => onOpenAssetsDir("microg")}
              title={t("dialog.openTaskOutput")}
              aria-label={t("dialog.openTaskOutput")}>
              <FolderOpen className='h-4 w-4' />
            </Button>
          </div>
        </div>
        <div className='space-y-2.5 rounded-xl bg-white   dark:bg-slate-800/70'>
          <div className=''>
            <Select value={repoMode === "local" ? MICROG_LOCAL_SOURCE_VALUE : repo} onValueChange={onChangeRepo}>
              <SelectTrigger className='border-0 rounded-none bg-slate-100/85 px-2 shadow-none hover:bg-slate-100 dark:bg-slate-800/70 dark:hover:bg-slate-800'>
                <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:text-slate-300'>
                  <FolderGit2 className='h-3.5 w-3.5' />
                  {t("source.repo")}
                </span>
                <SelectValue className='min-w-0' />
              </SelectTrigger>
              <SelectContent position='popper' side='bottom' align='start'>
                <SelectItem value={MICROG_LOCAL_SOURCE_VALUE} className='h-8'>
                  {t("source.localOnly")}
                </SelectItem>
                <SelectSeparator />
                {(Array.isArray(repoOptions) ? repoOptions : []).map((item) => (
                  <SelectItem key={`mircrog-repo-${item}`} value={item} className='h-8'>
                    <span className='min-w-0 truncate'>{item}</span>
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={MICROG_ADD_CUSTOM_REPO_VALUE} className='h-8'>
                  + {t("source.manageRepo")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {repoMode === "local" ? (
            <div className='assets-scroll max-h-[62vh] space-y-1 p-2.5 overflow-y-auto pr-1'>
              {(Array.isArray(localFiles) ? localFiles : []).length === 0 ? (
                <p className='text-sm text-muted-foreground'>{t("mircrog.empty")}</p>
              ) : null}
              {(Array.isArray(localFiles) ? localFiles : []).map((file) => (
                <div key={`mircrog-local-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 px-2.5 py-1.5'>
                  <div className='min-w-0 cursor-pointer' onClick={() => onOpenSourceFile("microg", file)}>
                    <div className='flex min-w-0 items-center gap-2 text-sm'>
                      <Check className='h-4 w-4 shrink-0 text-emerald-600' />
                      <span className='shrink-0 font-medium'>{file?.name || file?.fileName || ""}</span>
                      <span className='min-w-0 truncate text-xs text-muted-foreground/70'>{formatRepoPathOnly(file?.relativePath || "")}</span>
                      <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground/60'>
                        {hasText(file?.publishedAt) ? formatPublishedAt(file.publishedAt) : ""}
                      </span>
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(file?.sizeBytes || 0)}</span>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                      disabled={mircrogDeleteName === file?.relativePath}
                      onClick={() =>
                        openConfirmDialog(
                          "delete-microg-file",
                          t("confirm.deleteMicrogTitle"),
                          t("confirm.deleteMicrogDesc", { path: file?.relativePath || file?.name || "" }),
                          file,
                        )
                      }>
                      {mircrogDeleteName === file?.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : mixedItems.length === 0 ? (
            <p className='text-sm text-muted-foreground'>{t("mircrog.empty")}</p>
          ) : (
            <div className='assets-scroll max-h-[62vh] space-y-1 overflow-y-auto pr-1'>
              {mixedItems.map((item) => {
                const fileName = String(item?.fileName || "").trim()
                const isDownloading = (Array.isArray(downloadingNames) ? downloadingNames : []).includes(fileName)
                const canDownload = item.isRemote && !item.hasLocal && !isDownloading
                const canOpenLocal = item.hasLocal && hasText(item.relativePath)
                return (
                  <div
                    key={`mircrog-item-${item.key}`}
                    className={`flex min-h-8 items-center justify-between gap-2 px-2.5 py-1.5 ${(canDownload || canOpenLocal) ? "cursor-pointer hover:bg-muted/40" : ""}`}
                    onClick={
                      canDownload
                        ? () => {
                            setSourceVersion(fileName)
                            onDownload(fileName)
                          }
                        : canOpenLocal
                          ? () => onOpenSourceFile("microg", { relativePath: item.relativePath })
                        : undefined
                    }>
                    <div className='grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm'>
                      {item.hasLocal ? (
                        <Check className='h-4 w-4 shrink-0 text-emerald-600' />
                      ) : isDownloading ? (
                        <Loader2 className='h-4 w-4 shrink-0 animate-spin text-slate-500 dark:text-slate-300' />
                      ) : (
                        <Download className='h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300' />
                      )}
                      <span className='min-w-0 truncate font-medium'>{fileName}</span>
                      <span className='shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground'>
                        {hasText(item?.publishedAt) ? formatPublishedAt(item.publishedAt) : ""}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <ManageRepoDialog
        t={t}
        addRepoOpen={addRepoDialogType === "engine"}
        setAddRepoDialogType={setAddRepoDialogType}
        manageRepoOptions={repoOptions}
        defaultRepo={DEFAULT_MICROG_SOURCE_REPO}
        onDeleteManagedRepo={onDeleteRepo}
        addRepoDraft={repoDraft}
        addRepoBusy={addRepoBusy}
        addRepoDialogType='engine'
        setPatchesSourceRepoDraft={() => {}}
        setEngineSourceRepoDraft={setRepoDraft}
        onConfirmAddRepo={onConfirmAddRepo}
        hasText={hasText}
      />
    </div>
  )
}
