import { Cloud, FlaskConical, HardDrive, Loader2, Play, Plus, Settings2, Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { cn } from "../../lib/utils"

export default function MorpheSettingsDialog({
  open,
  onOpenChange,
  t,
  hasText,
  configForm,
  morpheSourcePopoverOpen,
  setMorpheSourcePopoverOpen,
  morpheSourceRepo,
  onSelectMorpheSourceRepo,
  morpheSourceRepoOptions,
  morpheSourceRepoDraft,
  setMorpheSourceRepoDraft,
  onAddMorpheSourceRepo,
  onDeleteMorpheSourceRepo,
  defaultMorpheSourceRepo,
  morpheSourceVersion,
  setMorpheSourceVersion,
  morpheSourceVersions,
  onDownloadMorpheFromSource,
  morpheSourceDownloading,
  morpheSourceLoading,
  morpheLocalFiles,
  morpheStableValue,
  morpheDevValue,
  updateConfigSection,
  formatBytes,
  openConfirmDialog,
  morpheDeleteName,
}) {
  const baseRepo = hasText(defaultMorpheSourceRepo) ? String(defaultMorpheSourceRepo).trim() : "MorpheApp/morphe-cli"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Settings2 className='h-4 w-4' />
            {t("morphe.settings")}
          </DialogTitle>
        </DialogHeader>
        <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
          <div className='space-y-2 rounded-md bg-muted/40 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-2'>
                <div className='relative'>
                  <Button variant='ghost' size='sm' onClick={() => setMorpheSourcePopoverOpen((prev) => !prev)} className='bg-sky-50 text-sky-800 hover:bg-sky-100'>
                    {t("source.downloadCli")}
                  </Button>
                  {morpheSourcePopoverOpen ? (
                    <div className='absolute left-0 top-full z-20 mt-2 w-[360px] max-w-[calc(100vw-4rem)] space-y-2 rounded-md bg-background/95 p-3 shadow-md'>
                      <div className='space-y-1'>
                        <Label htmlFor='morphe-source-repo'>{t("source.repo")}</Label>
                        <Select
                          value={hasText(morpheSourceRepo) ? morpheSourceRepo : "MorpheApp/morphe-cli"}
                          onValueChange={onSelectMorpheSourceRepo}>
                          <SelectTrigger id='morphe-source-repo'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {morpheSourceRepoOptions.map((repo) => {
                              const isCustom = String(repo || "").trim().toLowerCase() !== baseRepo.toLowerCase()
                              return (
                                <SelectItem key={`morphe-source-repo-${repo}`} value={repo}>
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
                                          onDeleteMorpheSourceRepo(repo)
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
                                  value={morpheSourceRepoDraft}
                                  onChange={(event) => setMorpheSourceRepoDraft(event.target.value)}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onMouseDown={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => {
                                    event.stopPropagation()
                                    if (event.key !== "Enter") return
                                    event.preventDefault()
                                    onAddMorpheSourceRepo()
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
                                    onAddMorpheSourceRepo()
                                  }}
                                  disabled={!hasText(morpheSourceRepoDraft)}>
                                  <Plus className='h-4 w-4' />
                                </Button>
                              </div>
                            </div>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='morphe-source-version'>{t("source.version")}</Label>
                        <Select value={morpheSourceVersion || "__NONE__"} onValueChange={(value) => setMorpheSourceVersion(value === "__NONE__" ? "" : value)}>
                          <SelectTrigger id='morphe-source-version'>
                            <SelectValue placeholder={t("source.selectVersion")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                            {morpheSourceVersions.map((item) => (
                              <SelectItem key={`morphe-src-ver-${String(item.fileName)}-${String(item.releaseTag || "")}`} value={String(item.fileName)}>
                                {item.fileName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className='w-full' onClick={onDownloadMorpheFromSource} disabled={morpheSourceDownloading || !hasText(morpheSourceVersion) || morpheSourceLoading}>
                        {morpheSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Play className='h-4 w-4' />}
                        {t("source.download")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <RadioGroup
              value={configForm.morpheCli.mode === "dev" ? morpheDevValue : configForm.morpheCli.mode === "stable" ? morpheStableValue : configForm.morpheCli.path || "__NONE__"}
              onValueChange={(value) => {
                if (value === morpheStableValue) {
                  updateConfigSection("morpheCli", { mode: "stable" })
                  return
                }
                if (value === morpheDevValue) {
                  updateConfigSection("morpheCli", { mode: "dev" })
                  return
                }
                updateConfigSection("morpheCli", { mode: "local", path: value === "__NONE__" ? "" : value })
              }}
              className='grid gap-2 space-y-1 max-h-[440px] overflow-auto'>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("morpheCli", { mode: "stable" })}>
                  <RadioGroupItem value={morpheStableValue} className='mt-0.5' />
                  <Cloud className='mt-0.5 h-4 w-4 text-sky-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>stable morphe-cli</span>
                    <span className='block text-[11px] text-muted-foreground break-all'>
                      {baseRepo}
                    </span>
                  </span>
                </label>
              </div>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("morpheCli", { mode: "dev" })}>
                  <RadioGroupItem value={morpheDevValue} className='mt-0.5' />
                  <FlaskConical className='mt-0.5 h-4 w-4 text-amber-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>dev morphe-cli</span>
                    <span className='block text-[11px] text-muted-foreground break-all'>
                      {baseRepo}
                    </span>
                  </span>
                </label>
              </div>
              {morpheLocalFiles.length > 0 ? (
                morpheLocalFiles.map((file) => (
                  <div
                    key={`morphe-row-${file.fullPath}`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors",
                      configForm.morpheCli.path === file.fullPath ? "bg-sky-100/90 text-sky-950" : "bg-background/80 hover:bg-muted/70",
                    )}>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("morpheCli", { path: file.fullPath })}>
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
                        openConfirmDialog("delete-morphe-file", t("confirm.deleteMorpheTitle"), t("confirm.deleteMorpheDesc", { path: file.relativePath }), file)
                      }}
                      disabled={morpheDeleteName === file.relativePath}
                      className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                      {morpheDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-xs text-muted-foreground'>{t("morphe.noLocalFiles")}</p>
              )}
            </RadioGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
