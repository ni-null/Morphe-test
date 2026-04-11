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
  openConfirmDialog,
  downloadedApkFiles,
  onOpenSourceFile,
  onOpenAssetsDir,
  apkDeletePath,
}) {
  const [addRepoDialogType, setAddRepoDialogType] = useState("")
  const [addRepoBusy, setAddRepoBusy] = useState(false)
  const [apkExpandedByGroup, setApkExpandedByGroup] = useState({})
  const [engineRepoMode, setEngineRepoMode] = useState("local")
  const [patchesRepoMode, setPatchesRepoMode] = useState("local")
  const engineSourceModel = {
    repo: engineSourceRepo,
    repoOptions: Array.isArray(engineSourceRepoOptions) ? engineSourceRepoOptions : [],
    repoDraft: typeof engineSourceRepoDraft === "string" ? engineSourceRepoDraft : "",
    setRepoDraft: setEngineSourceRepoDraft,
    onSelectRepo: onSelectEngineSourceRepo,
    onAddRepo: onAddEngineSourceRepo,
    onDeleteRepo: onDeleteEngineSourceRepo,
    sourceVersion: typeof engineSourceVersion === "string" ? engineSourceVersion : "",
    setSourceVersion: setEngineSourceVersion,
    sourceVersions: Array.isArray(engineSourceVersions) ? engineSourceVersions : [],
    onDownloadFromSource: onDownloadEngineFromSource,
    sourceDownloadingNames: Array.isArray(engineSourceDownloadingNames) ? engineSourceDownloadingNames : [],
    localFiles: Array.isArray(engineLocalFiles) ? engineLocalFiles : [],
    deleteName: typeof engineDeleteName === "string" ? engineDeleteName : "",
  }

  const patchBundleSourceModel = {
    repo: patchBundleSourceRepo,
    repoOptions: Array.isArray(patchBundleSourceRepoOptions) ? patchBundleSourceRepoOptions : [],
    repoDraft: typeof patchBundleSourceRepoDraft === "string" ? patchBundleSourceRepoDraft : "",
    setRepoDraft: setPatchBundleSourceRepoDraft,
    onSelectRepo: onSelectPatchBundleSourceRepo,
    onAddRepo: onAddPatchBundleSourceRepo,
    onDeleteRepo: onDeletePatchBundleSourceRepo,
    sourceVersion: typeof patchBundleSourceVersion === "string" ? patchBundleSourceVersion : "",
    setSourceVersion: setPatchBundleSourceVersion,
    sourceVersions: Array.isArray(patchBundleSourceVersions) ? patchBundleSourceVersions : [],
    onDownloadFromSource: onDownloadPatchBundleFromSource,
    sourceDownloadingNames: Array.isArray(patchBundleSourceDownloadingNames) ? patchBundleSourceDownloadingNames : [],
    localFiles: Array.isArray(patchBundleLocalFiles) ? patchBundleLocalFiles : [],
    deleteName: typeof patchBundleDeleteName === "string" ? patchBundleDeleteName : "",
  }

  const apkGroups = groupApksByPackage(downloadedApkFiles)
  const sectionMetaMap = buildSectionToPackageMetaMap(packageNameMetaMap)
  const addRepoOpen = addRepoDialogType === "engine" || addRepoDialogType === "patches"
  const addRepoDraft = addRepoDialogType === "patches" ? patchBundleSourceModel.repoDraft : engineSourceModel.repoDraft
  const engineLocalFileNameSet = new Set(engineSourceModel.localFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const patchesLocalFileNameSet = new Set(patchBundleSourceModel.localFiles.map((file) => String(file?.name || file?.fileName || "").trim().toLowerCase()).filter(Boolean))
  const engineMixedItems = buildSourceMixedItems(engineSourceModel.sourceVersions, engineSourceModel.localFiles, engineSourceModel.repo)
  const patchesMixedItems = buildSourceMixedItems(patchBundleSourceModel.sourceVersions, patchBundleSourceModel.localFiles, patchBundleSourceModel.repo)
  const manageRepoOptions = addRepoDialogType === "patches" ? patchBundleSourceModel.repoOptions : engineSourceModel.repoOptions
  const isPatchesManageDialog = addRepoDialogType === "patches"
  const defaultRepo = isPatchesManageDialog ? DEFAULT_PATCH_BUNDLE_SOURCE_REPO : DEFAULT_ENGINE_SOURCE_REPO

  async function onConfirmAddRepo() {
    if (addRepoBusy) return
    setAddRepoBusy(true)
    if (addRepoDialogType === "engine") {
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

  function onChangeEngineRepo(value) {
    if (value === ENGINE_ADD_CUSTOM_REPO_VALUE) {
      setAddRepoDialogType("engine")
      return
    }
    if (value === ENGINE_LOCAL_SOURCE_VALUE) {
      setEngineRepoMode("local")
      return
    }
    setEngineRepoMode("remote")
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

  function onDownloadEngineItem(fileName) {
    const next = String(fileName || "")
    engineSourceModel.setSourceVersion(next)
    if (!hasText(next)) return
    if (engineLocalFileNameSet.has(next.trim().toLowerCase())) return
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
                <Select value={engineRepoMode === "local" ? ENGINE_LOCAL_SOURCE_VALUE : hasText(engineSourceModel.repo) ? engineSourceModel.repo : DEFAULT_ENGINE_SOURCE_REPO} onValueChange={onChangeEngineRepo}>
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
                      <SelectItem key={`assets-engine-repo-${repo}`} value={repo} className='h-8'>
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
            {engineRepoMode === "local" ? (
              <div className='space-y-2'>
                {engineSourceModel.localFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("engine.noLocalFiles")}</p>
                ) : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {engineSourceModel.localFiles.map((file) => (
                      <div key={`assets-engine-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
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
                            onClick={() => openConfirmDialog("delete-engine-file", t("confirm.deleteEngineTitle"), t("confirm.deleteEngineDesc", { path: file.relativePath }), file)}>
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
                {engineMixedItems.length === 0 ? null : (
                  <div className='assets-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                    {engineMixedItems.map((item) => {
                      const isDownloading = (Array.isArray(engineSourceModel.sourceDownloadingNames) ? engineSourceModel.sourceDownloadingNames : []).includes(String(item.fileName || "").trim())
                      const canDownload = item.isRemote && !item.hasLocal
                      const canOpenLocal = item.hasLocal && hasText(item.relativePath)
                      return (
                        <div
                          key={`assets-engine-mixed-${item.key}`}
                          className={`flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1 ${(canDownload || canOpenLocal) ? "cursor-pointer hover:bg-muted/40" : ""}`}
                          onClick={canDownload ? () => onDownloadEngineItem(item.fileName) : canOpenLocal ? () => onOpenSourceFile("engine-cli", { relativePath: item.relativePath }) : undefined}>
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
        setEngineSourceRepoDraft={engineSourceModel.setRepoDraft}
        onConfirmAddRepo={onConfirmAddRepo}
        hasText={hasText}
      />
    </div>
  )
}
