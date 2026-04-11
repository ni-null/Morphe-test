import { Check, Download, FolderGit2, FolderOpen, Loader2, Package, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../../components/ui/select"
import packageNameMetaMap from "../../data/package-name-meta.json"
import DownloadedApkCard from "./components/DownloadedApkCard"
import ManageRepoDialog from "./components/ManageRepoDialog"
import {
  ENGINE_ADD_CUSTOM_REPO_VALUE,
  ENGINE_LOCAL_SOURCE_VALUE,
  PATCHES_ADD_CUSTOM_REPO_VALUE,
  PATCHES_LOCAL_SOURCE_VALUE,
  buildSectionToPackageMetaMap,
  buildSourceMixedItems,
  formatPublishedAt,
  formatRepoPathOnly,
  groupApksByPackage,
} from "./utils/assetsPageUtils"
import { DEFAULT_ENGINE_SOURCE_REPO, DEFAULT_PATCH_BUNDLE_SOURCE_REPO } from "../../lib/app-constants"

export default function AssetsPage({
  t,
  hasText,
  formatBytes,
  engineSourceRepo,
  engineSourceRepoOptions,
  engineSourceRepoDraft,
  setEngineSourceRepoDraft,
  onSelectEngineSourceRepo,
  onAddEngineSourceRepo,
  onDeleteEngineSourceRepo,
  engineSourceVersion,
  setEngineSourceVersion,
  engineSourceVersions,
  onDownloadEngineFromSource,
  engineSourceDownloadingNames,
  engineLocalFiles,
  engineDeleteName,
  patchBundleSourceRepo,
  patchBundleSourceRepoOptions,
  patchBundleSourceRepoDraft,
  setPatchBundleSourceRepoDraft,
  onSelectPatchBundleSourceRepo,
  onAddPatchBundleSourceRepo,
  onDeletePatchBundleSourceRepo,
  patchBundleSourceVersion,
  setPatchBundleSourceVersion,
  patchBundleSourceVersions,
  onDownloadPatchBundleFromSource,
  patchBundleSourceDownloadingNames,
  patchBundleLocalFiles,
  patchBundleDeleteName,
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
  morpheSourceDownloadingNames,
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
  patchesSourceDownloadingNames,
  patchesLocalFiles,
  patchesDeleteName,
  downloadedApkFiles,
  onOpenSourceFile,
  onOpenAssetsDir,
  apkDeletePath,
}) {
  const [addRepoDialogType, setAddRepoDialogType] = useState("")
  const [addRepoBusy, setAddRepoBusy] = useState(false)
  const [apkExpandedByGroup, setApkExpandedByGroup] = useState({})
  const [morpheRepoMode, setMorpheRepoMode] = useState("local")
  const [patchesRepoMode, setPatchesRepoMode] = useState("local")
  const engineSourceModel = {
    repo: hasText(engineSourceRepo) ? engineSourceRepo : morpheSourceRepo,
    repoOptions: Array.isArray(engineSourceRepoOptions) ? engineSourceRepoOptions : morpheSourceRepoOptions,
    repoDraft: typeof engineSourceRepoDraft === "string" ? engineSourceRepoDraft : morpheSourceRepoDraft,
    setRepoDraft: setEngineSourceRepoDraft || setMorpheSourceRepoDraft,
    onSelectRepo: onSelectEngineSourceRepo || onSelectMorpheSourceRepo,
    onAddRepo: onAddEngineSourceRepo || onAddMorpheSourceRepo,
    onDeleteRepo: onDeleteEngineSourceRepo || onDeleteMorpheSourceRepo,
    sourceVersion: typeof engineSourceVersion === "string" ? engineSourceVersion : morpheSourceVersion,
    setSourceVersion: setEngineSourceVersion || setMorpheSourceVersion,
    sourceVersions: Array.isArray(engineSourceVersions) ? engineSourceVersions : morpheSourceVersions,
    onDownloadFromSource: onDownloadEngineFromSource || onDownloadMorpheFromSource,
    sourceDownloadingNames: Array.isArray(engineSourceDownloadingNames) ? engineSourceDownloadingNames : morpheSourceDownloadingNames,
    localFiles: Array.isArray(engineLocalFiles) ? engineLocalFiles : morpheLocalFiles,
    deleteName: typeof engineDeleteName === "string" ? engineDeleteName : morpheDeleteName,
  }

  const patchBundleSourceModel = {
    repo: hasText(patchBundleSourceRepo) ? patchBundleSourceRepo : patchesSourceRepo,
    repoOptions: Array.isArray(patchBundleSourceRepoOptions) ? patchBundleSourceRepoOptions : patchesSourceRepoOptions,
    repoDraft: typeof patchBundleSourceRepoDraft === "string" ? patchBundleSourceRepoDraft : patchesSourceRepoDraft,
    setRepoDraft: setPatchBundleSourceRepoDraft || setPatchesSourceRepoDraft,
    onSelectRepo: onSelectPatchBundleSourceRepo || onSelectPatchesSourceRepo,
    onAddRepo: onAddPatchBundleSourceRepo || onAddPatchesSourceRepo,
    onDeleteRepo: onDeletePatchBundleSourceRepo || onDeletePatchesSourceRepo,
    sourceVersion: typeof patchBundleSourceVersion === "string" ? patchBundleSourceVersion : patchesSourceVersion,
    setSourceVersion: setPatchBundleSourceVersion || setPatchesSourceVersion,
    sourceVersions: Array.isArray(patchBundleSourceVersions) ? patchBundleSourceVersions : patchesSourceVersions,
    onDownloadFromSource: onDownloadPatchBundleFromSource || onDownloadPatchesFromSource,
    sourceDownloadingNames: Array.isArray(patchBundleSourceDownloadingNames) ? patchBundleSourceDownloadingNames : patchesSourceDownloadingNames,
    localFiles: Array.isArray(patchBundleLocalFiles) ? patchBundleLocalFiles : patchesLocalFiles,
    deleteName: typeof patchBundleDeleteName === "string" ? patchBundleDeleteName : patchesDeleteName,
  }

  const apkGroups = groupApksByPackage(downloadedApkFiles)
  const sectionMetaMap = buildSectionToPackageMetaMap(packageNameMetaMap)
  const addRepoOpen = addRepoDialogType === "morphe" || addRepoDialogType === "patches"
  const addRepoDraft = addRepoDialogType === "patches" ? patchBundleSourceModel.repoDraft : engineSourceModel.repoDraft
  const morpheLocalFileNameSet = new Set(engineSourceModel.localFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const patchesLocalFileNameSet = new Set(patchBundleSourceModel.localFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const morpheMixedItems = buildSourceMixedItems(engineSourceModel.sourceVersions, engineSourceModel.localFiles, engineSourceModel.repo)
  const patchesMixedItems = buildSourceMixedItems(patchBundleSourceModel.sourceVersions, patchBundleSourceModel.localFiles, patchBundleSourceModel.repo)
  const manageRepoOptions = addRepoDialogType === "patches" ? patchBundleSourceModel.repoOptions : engineSourceModel.repoOptions
  const isPatchesManageDialog = addRepoDialogType === "patches"
  const defaultRepo = isPatchesManageDialog ? DEFAULT_PATCH_BUNDLE_SOURCE_REPO : DEFAULT_ENGINE_SOURCE_REPO

  async function onConfirmAddRepo() {
    if (addRepoBusy) return
    setAddRepoBusy(true)
    if (addRepoDialogType === "morphe") {
      const ok = await engineSourceModel.onAddRepo()
      if (ok) setAddRepoDialogType("")
      setAddRepoBusy(false)
      return
    }
    if (addRepoDialogType === "patches") {
      const ok = await patchBundleSourceModel.onAddRepo()
      if (ok) setAddRepoDialogType("")
    }
    setAddRepoBusy(false)
  }

  function onDeleteManagedRepo(repo) {
    if (isPatchesManageDialog) {
      patchBundleSourceModel.onDeleteRepo(repo)
      return
    }
    engineSourceModel.onDeleteRepo(repo)
  }

  function onChangeMorpheRepo(value) {
    if (value === ENGINE_ADD_CUSTOM_REPO_VALUE) {
      setAddRepoDialogType("morphe")
      return
    }
    if (value === ENGINE_LOCAL_SOURCE_VALUE) {
      setMorpheRepoMode("local")
      return
    }
    setMorpheRepoMode("remote")
    engineSourceModel.onSelectRepo(value)
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
    patchBundleSourceModel.onSelectRepo(value)
  }

  function onDownloadMorpheItem(fileName) {
    const next = String(fileName || "")
    engineSourceModel.setSourceVersion(next)
    if (!hasText(next)) return
    if (morpheLocalFileNameSet.has(next.trim().toLowerCase())) return
    engineSourceModel.onDownloadFromSource(next)
  }

  function onDownloadPatchesItem(fileName) {
    const next = String(fileName || "")
    patchBundleSourceModel.setSourceVersion(next)
    if (!hasText(next)) return
    if (patchesLocalFileNameSet.has(next.trim().toLowerCase())) return
    patchBundleSourceModel.onDownloadFromSource(next)
  }

  return (
    <div className='space-y-4'>
      <section className='space-y-2'>
        <div className='flex items-center justify-between gap-2 px-1'>
          <h2 className='text-base flex items-center gap-2 font-semibold'>
            <Settings2 className='h-4 w-4' />
            {t("assets.cli")}
          </h2>
          <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => onOpenAssetsDir("engine-cli")} aria-label={t("dialog.openTaskOutput")} title={t("dialog.openTaskOutput")}>
            <FolderOpen className='h-4 w-4' />
          </Button>
        </div>
        <div className='space-y-2.5 rounded-xl bg-white p-2.5 dark:bg-slate-800/70'>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <Select value={morpheRepoMode === "local" ? ENGINE_LOCAL_SOURCE_VALUE : hasText(engineSourceModel.repo) ? engineSourceModel.repo : DEFAULT_ENGINE_SOURCE_REPO} onValueChange={onChangeMorpheRepo}>
                  <SelectTrigger className='border-0 bg-transparent shadow-none hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'>
                    <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                      <FolderGit2 className='h-3.5 w-3.5' />
                      {t("source.repo")}
                    </span>
                    <SelectValue className='min-w-0' />
                  </SelectTrigger>
                  <SelectContent position='popper' side='bottom' align='start'>
                    <SelectItem value={ENGINE_LOCAL_SOURCE_VALUE} className='h-8'>
                      {t("source.localOnly")}
                    </SelectItem>
                    <SelectSeparator />
                    {engineSourceModel.repoOptions.map((repo) => (
                      <SelectItem key={`assets-morphe-repo-${repo}`} value={repo} className='h-8'>
                        <span className='min-w-0 truncate'>{repo}</span>
                      </SelectItem>
                    ))}
                    <SelectSeparator />
                    <SelectItem value={ENGINE_ADD_CUSTOM_REPO_VALUE} className='h-8'>
                      + {t("source.manageRepo")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {morpheRepoMode === "local" ? (
              <div className='space-y-2'>
                {engineSourceModel.localFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("morphe.noLocalFiles")}</p>
                ) : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {engineSourceModel.localFiles.map((file) => (
                      <div key={`assets-morphe-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
                        <div className='min-w-0 cursor-pointer' onClick={() => onOpenSourceFile("engine-cli", file)}>
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
                            disabled={engineSourceModel.deleteName === file.relativePath}
                            onClick={() => openConfirmDialog("delete-morphe-file", t("confirm.deleteMorpheTitle"), t("confirm.deleteMorpheDesc", { path: file.relativePath }), file)}>
                            {engineSourceModel.deleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
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
                      const isDownloading = (Array.isArray(engineSourceModel.sourceDownloadingNames) ? engineSourceModel.sourceDownloadingNames : []).includes(String(item.fileName || "").trim())
                      const canDownload = item.isRemote && !item.hasLocal
                      const canOpenLocal = item.hasLocal && hasText(item.relativePath)
                      return (
                        <div
                          key={`assets-morphe-mixed-${item.key}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1 ${(canDownload || canOpenLocal) ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canDownload ? () => onDownloadMorpheItem(item.fileName) : canOpenLocal ? () => onOpenSourceFile("engine-cli", { relativePath: item.relativePath }) : undefined}>
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
        </div>
      </section>

      <section className='space-y-2'>
        <div className='flex items-center justify-between gap-2 px-1'>
          <h2 className='text-base flex items-center gap-2 font-semibold'>
            <Package className='h-4 w-4' />
            {t("assets.patches")}
          </h2>
          <Button variant='ghost' size='icon' className='h-8 w-8' onClick={() => onOpenAssetsDir("patches")} aria-label={t("dialog.openTaskOutput")} title={t("dialog.openTaskOutput")}>
            <FolderOpen className='h-4 w-4' />
          </Button>
        </div>
        <div className='space-y-2.5 rounded-xl bg-white p-2.5 dark:bg-slate-800/70'>
            <div className='flex items-center gap-2'>
              <div className='min-w-0 flex-1'>
                <Select value={patchesRepoMode === "local" ? PATCHES_LOCAL_SOURCE_VALUE : hasText(patchBundleSourceModel.repo) ? patchBundleSourceModel.repo : DEFAULT_PATCH_BUNDLE_SOURCE_REPO} onValueChange={onChangePatchesRepo}>
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
                    {patchBundleSourceModel.repoOptions.map((repo) => (
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
                {patchBundleSourceModel.localFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("patches.noLocalFiles")}</p>
                ) : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {patchBundleSourceModel.localFiles.map((file) => (
                      <div key={`assets-patches-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
                        <div className='min-w-0 cursor-pointer' onClick={() => onOpenSourceFile("patches", file)}>
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
                            disabled={patchBundleSourceModel.deleteName === file.relativePath}
                            onClick={() => openConfirmDialog("delete-patches-file", t("confirm.deletePatchesTitle"), t("confirm.deletePatchesDesc", { path: file.relativePath }), file)}>
                            {patchBundleSourceModel.deleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
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
                      const isDownloading = (Array.isArray(patchBundleSourceModel.sourceDownloadingNames) ? patchBundleSourceModel.sourceDownloadingNames : []).includes(String(item.fileName || "").trim())
                      const canDownload = item.isRemote && !item.hasLocal
                      const canOpenLocal = item.hasLocal && hasText(item.relativePath)
                      return (
                        <div
                          key={`assets-patches-mixed-${item.key}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1 ${(canDownload || canOpenLocal) ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canDownload ? () => onDownloadPatchesItem(item.fileName) : canOpenLocal ? () => onOpenSourceFile("patches", { relativePath: item.relativePath }) : undefined}>
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
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
        </div>
      </section>

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
        setPatchesSourceRepoDraft={patchBundleSourceModel.setRepoDraft}
        setMorpheSourceRepoDraft={engineSourceModel.setRepoDraft}
        onConfirmAddRepo={onConfirmAddRepo}
        hasText={hasText}
      />
    </div>
  )
}
