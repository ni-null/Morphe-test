import { Check, Download, FolderGit2, FolderOpen, Loader2, Package, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../../components/ui/select"
import packageNameMetaMap from "../../data/package-name-meta.json"
import DownloadedApkCard from "./components/DownloadedApkCard"
import ManageRepoDialog from "./components/ManageRepoDialog"
import {
  MORPHE_ADD_CUSTOM_REPO_VALUE,
  MORPHE_LOCAL_SOURCE_VALUE,
  PATCHES_ADD_CUSTOM_REPO_VALUE,
  PATCHES_LOCAL_SOURCE_VALUE,
  buildSectionToPackageMetaMap,
  buildSourceMixedItems,
  formatPublishedAt,
  formatRepoPathOnly,
  groupApksByPackage,
} from "./utils/assetsPageUtils"

export default function AssetsPage({
  t,
  hasText,
  formatBytes,
  morpheSourceRepo,
  morpheSourceRepoOptions,
  morpheSourceRepoDraft,
  setMorpheSourceRepoDraft,
  onSelectMorpheSourceRepo,
  onAddMorpheSourceRepo,
  onDeleteMorpheSourceRepo,
  morpheSourceVersion,
  setMorpheSourceVersion,
  morpheSourceVersions,
  onDownloadMorpheFromSource,
  morpheSourceDownloading,
  morpheLocalFiles,
  openConfirmDialog,
  morpheDeleteName,
  patchesSourceRepo,
  patchesSourceRepoOptions,
  patchesSourceRepoDraft,
  setPatchesSourceRepoDraft,
  onSelectPatchesSourceRepo,
  onAddPatchesSourceRepo,
  onDeletePatchesSourceRepo,
  patchesSourceVersion,
  setPatchesSourceVersion,
  patchesSourceVersions,
  onDownloadPatchesFromSource,
  patchesSourceDownloading,
  patchesLocalFiles,
  patchesDeleteName,
  downloadedApkFiles,
  onOpenAssetsDir,
  apkDeletePath,
}) {
  const [addRepoDialogType, setAddRepoDialogType] = useState("")
  const [addRepoBusy, setAddRepoBusy] = useState(false)
  const [apkExpandedByGroup, setApkExpandedByGroup] = useState({})
  const [morpheRepoMode, setMorpheRepoMode] = useState("local")
  const [patchesRepoMode, setPatchesRepoMode] = useState("local")
  const apkGroups = groupApksByPackage(downloadedApkFiles)
  const sectionMetaMap = buildSectionToPackageMetaMap(packageNameMetaMap)
  const addRepoOpen = addRepoDialogType === "morphe" || addRepoDialogType === "patches"
  const addRepoDraft = addRepoDialogType === "patches" ? patchesSourceRepoDraft : morpheSourceRepoDraft
  const morpheLocalFileNameSet = new Set(morpheLocalFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const patchesLocalFileNameSet = new Set(patchesLocalFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const morpheMixedItems = buildSourceMixedItems(morpheSourceVersions, morpheLocalFiles, morpheSourceRepo)
  const patchesMixedItems = buildSourceMixedItems(patchesSourceVersions, patchesLocalFiles, patchesSourceRepo)
  const manageRepoOptions = addRepoDialogType === "patches" ? patchesSourceRepoOptions : morpheSourceRepoOptions
  const isPatchesManageDialog = addRepoDialogType === "patches"
  const defaultRepo = isPatchesManageDialog ? "MorpheApp/morphe-patches" : "MorpheApp/morphe-cli"

  async function onConfirmAddRepo() {
    if (addRepoBusy) return
    setAddRepoBusy(true)
    if (addRepoDialogType === "morphe") {
      const ok = await onAddMorpheSourceRepo()
      if (ok) setAddRepoDialogType("")
      setAddRepoBusy(false)
      return
    }
    if (addRepoDialogType === "patches") {
      const ok = await onAddPatchesSourceRepo()
      if (ok) setAddRepoDialogType("")
    }
    setAddRepoBusy(false)
  }

  function onDeleteManagedRepo(repo) {
    if (isPatchesManageDialog) {
      onDeletePatchesSourceRepo(repo)
      return
    }
    onDeleteMorpheSourceRepo(repo)
  }

  function onChangeMorpheRepo(value) {
    if (value === MORPHE_ADD_CUSTOM_REPO_VALUE) {
      setAddRepoDialogType("morphe")
      return
    }
    if (value === MORPHE_LOCAL_SOURCE_VALUE) {
      setMorpheRepoMode("local")
      return
    }
    setMorpheRepoMode("remote")
    onSelectMorpheSourceRepo(value)
  }

  function onChangePatchesRepo(value) {
    if (value === PATCHES_ADD_CUSTOM_REPO_VALUE) {
      setAddRepoDialogType("patches")
      return
    }
    if (value === PATCHES_LOCAL_SOURCE_VALUE) {
      setPatchesRepoMode("local")
      return
    }
    setPatchesRepoMode("remote")
    onSelectPatchesSourceRepo(value)
  }

  function onDownloadMorpheItem(fileName) {
    const next = String(fileName || "")
    setMorpheSourceVersion(next)
    if (!hasText(next)) return
    if (morpheLocalFileNameSet.has(next.trim().toLowerCase())) return
    onDownloadMorpheFromSource(next)
  }

  function onDownloadPatchesItem(fileName) {
    const next = String(fileName || "")
    setPatchesSourceVersion(next)
    if (!hasText(next)) return
    if (patchesLocalFileNameSet.has(next.trim().toLowerCase())) return
    onDownloadPatchesFromSource(next)
  }

  return (
    <div className='space-y-4'>
      <Card className='border-0 bg-card shadow-sm'>
        <CardHeader className='py-3'>
          <CardTitle className='text-base flex items-center justify-between gap-2'>
            <span className='inline-flex items-center gap-2'>
              <Settings2 className='h-4 w-4' />
              {t("assets.cli")}
            </span>
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => onOpenAssetsDir("morphe-cli")} aria-label={t("dialog.openTaskOutput")} title={t("dialog.openTaskOutput")}>
              <FolderOpen className='h-4 w-4' />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-2.5 rounded-xl bg-slate-100/85 p-2.5 dark:bg-slate-800/70'>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <Select value={morpheRepoMode === "local" ? MORPHE_LOCAL_SOURCE_VALUE : hasText(morpheSourceRepo) ? morpheSourceRepo : "MorpheApp/morphe-cli"} onValueChange={onChangeMorpheRepo}>
                  <SelectTrigger className='border-0 bg-transparent shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'>
                    <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                      <FolderGit2 className='h-3.5 w-3.5' />
                      {t("source.repo")}
                    </span>
                    <SelectValue className='min-w-0' />
                  </SelectTrigger>
                  <SelectContent position='popper' side='bottom' align='start'>
                    <SelectItem value={MORPHE_LOCAL_SOURCE_VALUE} className='h-8'>
                      {t("source.localOnly")}
                    </SelectItem>
                    <SelectSeparator />
                    {morpheSourceRepoOptions.map((repo) => (
                      <SelectItem key={`assets-morphe-repo-${repo}`} value={repo} className='h-8'>
                        <span className='min-w-0 truncate'>{repo}</span>
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value={MORPHE_ADD_CUSTOM_REPO_VALUE} className='h-8'>
                      + {t("source.manageRepo")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {morpheRepoMode === "local" ? (
              <div className='space-y-2'>
                {morpheLocalFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("morphe.noLocalFiles")}</p>
                ) : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {morpheLocalFiles.map((file) => (
                      <div key={`assets-morphe-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
                        <div className='min-w-0'>
                          <div className='flex min-w-0 items-center gap-2 text-sm'>
                            <span className='shrink-0 font-medium'>{file.name}</span>
                            <span className='min-w-0 truncate text-xs text-muted-foreground/70'>{formatRepoPathOnly(file.relativePath)}</span>
                            {hasText(file.publishedAt) ? <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground/60'>{formatPublishedAt(file.publishedAt)}</span> : null}
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <span className='whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                            disabled={morpheDeleteName === file.relativePath}
                            onClick={() => openConfirmDialog("delete-morphe-file", t("confirm.deleteMorpheTitle"), t("confirm.deleteMorpheDesc", { path: file.relativePath }), file)}>
                            {morpheDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className='space-y-2'>
                {morpheMixedItems.length === 0 ? null : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {morpheMixedItems.map((item) => {
                      const isDownloading = morpheSourceDownloading && String(morpheSourceVersion || "").trim() === String(item.fileName || "").trim()
                      const canDownload = item.isRemote && !item.hasLocal
                      return (
                        <div
                          key={`assets-morphe-mixed-${item.key}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1 ${canDownload ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canDownload ? () => onDownloadMorpheItem(item.fileName) : undefined}>
                          <div className='grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm'>
                            {item.hasLocal ? (
                              <Check className='h-4 w-4 shrink-0 text-emerald-600' />
                            ) : isDownloading ? (
                              <Loader2 className='h-4 w-4 shrink-0 animate-spin text-slate-500 dark:text-slate-300' />
                            ) : (
                              <Download className={`h-4 w-4 shrink-0 ${canDownload ? "cursor-pointer text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`} />
                            )}
                            <span className='min-w-0 truncate font-medium'>{item.fileName}</span>
                            <span className='shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground'>{hasText(item.publishedAt) ? formatPublishedAt(item.publishedAt) : ""}</span>
                          </div>
                          {item.hasLocal && item.relativePath ? <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(item.sizeBytes)}</span> : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className='border-0 bg-card shadow-sm'>
        <CardHeader className='py-3'>
          <CardTitle className='text-base flex items-center justify-between gap-2'>
            <span className='inline-flex items-center gap-2'>
              <Package className='h-4 w-4' />
              {t("assets.patches")}
            </span>
            <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => onOpenAssetsDir("patches")} aria-label={t("dialog.openTaskOutput")} title={t("dialog.openTaskOutput")}>
              <FolderOpen className='h-4 w-4' />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-2.5 rounded-xl bg-slate-100/85 p-2.5 dark:bg-slate-800/70'>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <Select value={patchesRepoMode === "local" ? PATCHES_LOCAL_SOURCE_VALUE : hasText(patchesSourceRepo) ? patchesSourceRepo : "MorpheApp/morphe-patches"} onValueChange={onChangePatchesRepo}>
                  <SelectTrigger className='border-0 bg-transparent shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'>
                    <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                      <FolderGit2 className='h-3.5 w-3.5' />
                      {t("source.repo")}
                    </span>
                    <SelectValue className='min-w-0' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PATCHES_LOCAL_SOURCE_VALUE} className='h-8'>
                      {t("source.localOnly")}
                    </SelectItem>
                    <SelectSeparator />
                    {patchesSourceRepoOptions.map((repo) => (
                      <SelectItem key={`assets-patches-repo-${repo}`} value={repo} className='h-8'>
                        <span className='min-w-0 truncate'>{repo}</span>
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value={PATCHES_ADD_CUSTOM_REPO_VALUE} className='h-8'>
                      + {t("source.manageRepo")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {patchesRepoMode === "local" ? (
              <div className='space-y-2'>
                {patchesLocalFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("patches.noLocalFiles")}</p>
                ) : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {patchesLocalFiles.map((file) => (
                      <div key={`assets-patches-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
                        <div className='min-w-0'>
                          <div className='flex min-w-0 items-center gap-2 text-sm'>
                            <span className='shrink-0 font-medium'>{file.name}</span>
                            <span className='min-w-0 truncate text-xs text-muted-foreground/70'>{formatRepoPathOnly(file.relativePath)}</span>
                            {hasText(file.publishedAt) ? <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground/60'>{formatPublishedAt(file.publishedAt)}</span> : null}
                          </div>
                        </div>
                        <div className='flex items-center gap-2'>
                          <span className='whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-6 w-6 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                            disabled={patchesDeleteName === file.relativePath}
                            onClick={() => openConfirmDialog("delete-patches-file", t("confirm.deletePatchesTitle"), t("confirm.deletePatchesDesc", { path: file.relativePath }), file)}>
                            {patchesDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className='space-y-2'>
                {patchesMixedItems.length === 0 ? null : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {patchesMixedItems.map((item) => {
                      const isDownloading = patchesSourceDownloading && String(patchesSourceVersion || "").trim() === String(item.fileName || "").trim()
                      const canDownload = item.isRemote && !item.hasLocal
                      return (
                        <div
                          key={`assets-patches-mixed-${item.key}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1 ${canDownload ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canDownload ? () => onDownloadPatchesItem(item.fileName) : undefined}>
                          <div className='grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm'>
                            {item.hasLocal ? (
                              <Check className='h-4 w-4 shrink-0 text-emerald-600' />
                            ) : isDownloading ? (
                              <Loader2 className='h-4 w-4 shrink-0 animate-spin text-slate-500 dark:text-slate-300' />
                            ) : (
                              <Download className={`h-4 w-4 shrink-0 ${canDownload ? "cursor-pointer text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`} />
                            )}
                            <span className='min-w-0 truncate font-medium'>{item.fileName}</span>
                            <span className='shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground'>{hasText(item.publishedAt) ? formatPublishedAt(item.publishedAt) : ""}</span>
                          </div>
                          {item.hasLocal && item.relativePath ? <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(item.sizeBytes)}</span> : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DownloadedApkCard
        t={t}
        onOpenAssetsDir={onOpenAssetsDir}
        apkGroups={apkGroups}
        sectionMetaMap={sectionMetaMap}
        hasText={hasText}
        apkExpandedByGroup={apkExpandedByGroup}
        setApkExpandedByGroup={setApkExpandedByGroup}
        formatBytes={formatBytes}
        openConfirmDialog={openConfirmDialog}
        apkDeletePath={apkDeletePath}
      />

      <ManageRepoDialog
        t={t}
        addRepoOpen={addRepoOpen}
        setAddRepoDialogType={setAddRepoDialogType}
        manageRepoOptions={manageRepoOptions}
        defaultRepo={defaultRepo}
        onDeleteManagedRepo={onDeleteManagedRepo}
        addRepoDraft={addRepoDraft}
        addRepoBusy={addRepoBusy}
        addRepoDialogType={addRepoDialogType}
        setPatchesSourceRepoDraft={setPatchesSourceRepoDraft}
        setMorpheSourceRepoDraft={setMorpheSourceRepoDraft}
        onConfirmAddRepo={onConfirmAddRepo}
        hasText={hasText}
      />
    </div>
  )
}
