import { Cloud, FlaskConical, HardDrive, Loader2, Package, Play, Plus, Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { cn } from "../../lib/utils"

export default function PatchesSettingsDialog({
  open,
  onOpenChange,
  t,
  hasText,
  configForm,
  patchesSourcePopoverOpen,
  setPatchesSourcePopoverOpen,
  patchesSourceRepo,
  onSelectPatchesSourceRepo,
  patchesSourceRepoOptions,
  patchesSourceRepoDraft,
  setPatchesSourceRepoDraft,
  onAddPatchesSourceRepo,
  onDeletePatchesSourceRepo,
  defaultPatchesSourceRepo,
  patchesSourceVersion,
  setPatchesSourceVersion,
  patchesSourceVersions,
  onDownloadPatchesFromSource,
  patchesSourceDownloading,
  patchesSourceLoading,
  patchesLocalFiles,
  patchesStableValue,
  patchesDevValue,
  updateConfigSection,
  formatBytes,
  openConfirmDialog,
  patchesDeleteName,
}) {
  const baseRepo = hasText(defaultPatchesSourceRepo) ? String(defaultPatchesSourceRepo).trim() : "MorpheApp/morphe-patches"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Package className='h-4 w-4' />
            {t("patches.settings")}
          </DialogTitle>
        </DialogHeader>
        <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
          <div className='space-y-2 rounded-md bg-muted/40 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <div className='relative'>
                  <Button variant='ghost' size='sm' onClick={() => setPatchesSourcePopoverOpen((prev) => !prev)} className='bg-sky-50 text-sky-800 hover:bg-sky-100'>
                    {t("source.downloadPatches")}
                  </Button>
                  {patchesSourcePopoverOpen ? (
                    <div className='absolute left-0 top-full z-20 mt-2 w-[360px] max-w-[calc(100vw-4rem)] space-y-2 rounded-md bg-background/95 p-3 shadow-md'>
                      <div className='space-y-1'>
                        <Label htmlFor='patches-source-repo'>{t("source.repo")}</Label>
                        <Select
                          value={hasText(patchesSourceRepo) ? patchesSourceRepo : "MorpheApp/morphe-patches"}
                          onValueChange={onSelectPatchesSourceRepo}>
                          <SelectTrigger id='patches-source-repo'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {patchesSourceRepoOptions.map((repo) => {
                              const isCustom = String(repo || "").trim().toLowerCase() !== baseRepo.toLowerCase()
                              return (
                                <SelectItem key={`patches-source-repo-${repo}`} value={repo}>
                                  <span className='flex w-full items-center justify-between gap-2'>
                                    <span className='min-w-0 truncate'>{repo}</span>
                                    {isCustom ? (
                                      <button
                                        type='button'
                                        className='inline-flex h-5 w-5 items-center justify-center rounded-sm text-red-600 hover:bg-red-50 hover:text-red-700'
                                        onPointerDown={(event) => {
                                          event.preventDefault()
                                          event.stopPropagation()
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault()
                                          event.stopPropagation()
                                          onDeletePatchesSourceRepo(repo)
                                        }}
                                        aria-label={t("source.deleteCustomRepo")}
                                        title={t("source.deleteCustomRepo")}>
                                        <Trash2 className='h-3.5 w-3.5' />
                                      </button>
                                    ) : null}
                                  </span>
                                </SelectItem>
                              )
                            })}
                            <div
                              className='mt-1 border-t p-2'
                              onPointerDown={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}>
                              <div className='flex items-center gap-2'>
                                <Input
                                  value={patchesSourceRepoDraft}
                                  onChange={(event) => setPatchesSourceRepoDraft(event.target.value)}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => {
                                    event.stopPropagation()
                                    if (event.key !== "Enter") return
                                    event.preventDefault()
                                    onAddPatchesSourceRepo()
                                  }}
                                  placeholder='owner/repo'
                                  className='h-8'
                                  autoFocus
                                />
                                <Button
                                  type='button'
                                  variant='outline'
                                  size='icon'
                                  className='h-8 w-8'
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onAddPatchesSourceRepo()
                                  }}
                                  disabled={!hasText(patchesSourceRepoDraft)}>
                                  <Plus className='h-4 w-4' />
                                </Button>
                              </div>
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='patches-source-version'>{t("source.version")}</Label>
                        <Select value={patchesSourceVersion || "__NONE__"} onValueChange={(value) => setPatchesSourceVersion(value === "__NONE__" ? "" : value)}>
                          <SelectTrigger id='patches-source-version'>
                            <SelectValue placeholder={t("source.selectVersion")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                            {patchesSourceVersions.map((item) => (
                              <SelectItem key={`patches-src-ver-${String(item.fileName)}-${String(item.releaseTag || "")}`} value={String(item.fileName)}>
                                {item.fileName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className='w-full' onClick={onDownloadPatchesFromSource} disabled={patchesSourceDownloading || !hasText(patchesSourceVersion) || patchesSourceLoading}>
                        {patchesSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Play className='h-4 w-4' />}
                        {t("source.download")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <RadioGroup
              value={configForm.patches.mode === "dev" ? patchesDevValue : configForm.patches.mode === "stable" ? patchesStableValue : configForm.patches.path || "__NONE__"}
              onValueChange={(value) => {
                if (value === patchesStableValue) {
                  updateConfigSection("patches", { mode: "stable" })
                  return
                }
                if (value === patchesDevValue) {
                  updateConfigSection("patches", { mode: "dev" })
                  return
                }
                updateConfigSection("patches", { mode: "local", path: value === "__NONE__" ? "" : value })
              }}
              className='grid gap-2 space-y-1 max-h-[440px] overflow-auto'>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patches", { mode: "stable" })}>
                  <RadioGroupItem value={patchesStableValue} className='mt-0.5' />
                  <Cloud className='mt-0.5 h-4 w-4 text-sky-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>stable patches</span>
                    <span className='block text-[11px] text-muted-foreground break-all'>
                      {baseRepo}
                    </span>
                  </span>
                </label>
              </div>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patches", { mode: "dev" })}>
                  <RadioGroupItem value={patchesDevValue} className='mt-0.5' />
                  <FlaskConical className='mt-0.5 h-4 w-4 text-amber-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>dev patches</span>
                    <span className='block text-[11px] text-muted-foreground break-all'>
                      {baseRepo}
                    </span>
                  </span>
                </label>
              </div>
              {patchesLocalFiles.length > 0 ? (
                patchesLocalFiles.map((file) => (
                  <div
                    key={`patches-row-${file.fullPath}`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors",
                      configForm.patches.path === file.fullPath ? "bg-sky-100/90 text-sky-950" : "bg-background/80 hover:bg-muted/70",
                    )}>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patches", { path: file.fullPath })}>
                      <RadioGroupItem value={file.fullPath} className='mt-0.5' />
                      <HardDrive className='mt-0.5 h-4 w-4 text-muted-foreground' />
                      <span className='min-w-0' title={file.relativePath}>
                        <span className='block text-sm font-medium break-all'>
                          {file.name} <span className='text-xs text-muted-foreground'>({formatBytes(file.sizeBytes)})</span>
                        </span>
                        <span className='block text-[11px] text-muted-foreground break-all'>{file.relativePath}</span>
                      </span>
                    </label>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={(event) => {
                        event.stopPropagation()
                        openConfirmDialog("delete-patches-file", t("confirm.deletePatchesTitle"), t("confirm.deletePatchesDesc", { path: file.relativePath }), file)
                      }}
                      disabled={patchesDeleteName === file.relativePath}
                      className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                      {patchesDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-xs text-muted-foreground'>{t("patches.noLocalFiles")}</p>
              )}
            </RadioGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
