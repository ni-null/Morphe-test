import { Download, Loader2, Package, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import packageNameMetaMap from "../../json/package-name-meta.json"

function inferGroupKeyFromApk(file) {
  const name = String(file?.name || file?.fileName || "")
  const first = String(name.split("-")[0] || "")
    .trim()
    .toLowerCase()
  if (first) return first
  return "__unknown__"
}

function groupApksByPackage(files) {
  const list = Array.isArray(files) ? files : []
  const buckets = new Map()
  for (const file of list) {
    const groupKey = inferGroupKeyFromApk(file)
    if (!buckets.has(groupKey)) buckets.set(groupKey, [])
    buckets.get(groupKey).push(file)
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }))
}

function buildSectionToPackageMetaMap(source) {
  const out = {}
  if (!source || typeof source !== "object") return out
  for (const [packageName, meta] of Object.entries(source)) {
    const section = String(meta?.section || "")
      .trim()
      .toLowerCase()
    if (!section) continue
    out[section] = {
      packageName: String(packageName || "").trim(),
      label: String(meta?.label || "").trim(),
      icon: String(meta?.icon || "").trim(),
    }
  }
  return out
}

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
  morpheSourceVersion,
  setMorpheSourceVersion,
  morpheSourceVersions,
  onDownloadMorpheFromSource,
  morpheSourceLoading,
  morpheSourceDownloading,
  loadMorpheSourceVersions,
  loadMorpheLocalFiles,
  morpheLocalFiles,
  openConfirmDialog,
  morpheDeleteName,
  patchesSourceRepo,
  patchesSourceRepoOptions,
  patchesSourceRepoDraft,
  setPatchesSourceRepoDraft,
  onSelectPatchesSourceRepo,
  onAddPatchesSourceRepo,
  patchesSourceVersion,
  setPatchesSourceVersion,
  patchesSourceVersions,
  onDownloadPatchesFromSource,
  patchesSourceLoading,
  patchesSourceDownloading,
  loadPatchesSourceVersions,
  loadPatchesLocalFiles,
  patchesLocalFiles,
  patchesDeleteName,
  downloadedApkFiles,
  downloadedApkDir,
  downloadedApkLoading,
  loadDownloadedApkFiles,
}) {
  const [addRepoDialogType, setAddRepoDialogType] = useState("")
  const apkGroups = groupApksByPackage(downloadedApkFiles)
  const sectionMetaMap = buildSectionToPackageMetaMap(packageNameMetaMap)
  const addRepoOpen = addRepoDialogType === "morphe" || addRepoDialogType === "patches"
  const addRepoDraft = addRepoDialogType === "patches" ? patchesSourceRepoDraft : morpheSourceRepoDraft

  function onConfirmAddRepo() {
    if (addRepoDialogType === "morphe") {
      onAddMorpheSourceRepo()
      if (hasText(morpheSourceRepoDraft)) {
        setAddRepoDialogType("")
      }
      return
    }
    if (addRepoDialogType === "patches") {
      onAddPatchesSourceRepo()
      if (hasText(patchesSourceRepoDraft)) {
        setAddRepoDialogType("")
      }
    }
  }

  return (
    <div className='space-y-4'>
      <Card>
            <CardHeader className='py-3'>
              <CardTitle className='text-base flex items-center justify-between gap-2'>
                <span className='inline-flex items-center gap-2'>
                  <Settings2 className='h-4 w-4' />
                  {t("assets.cli")}
                </span>
                <div className='flex items-center gap-2'>
                  <Button size='sm' variant='outline' onClick={() => setAddRepoDialogType("morphe")}>
                    <Plus className='h-4 w-4' />
                    {t("source.addCustomRepo")}
                  </Button>
                  <Button size='sm' variant='outline' onClick={loadMorpheLocalFiles}>
                    <RefreshCw className='h-4 w-4' />
                    {t("action.refresh")}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid gap-2 md:grid-cols-[1fr_1fr_auto]'>
                <div className='space-y-1'>
                  <Label>{t("source.repo")}</Label>
                  <Select value={hasText(morpheSourceRepo) ? morpheSourceRepo : "MorpheApp/morphe-cli"} onValueChange={onSelectMorpheSourceRepo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {morpheSourceRepoOptions.map((repo) => (
                        <SelectItem key={`assets-morphe-repo-${repo}`} value={repo}>
                          {repo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1'>
                  <Label>{t("source.version")}</Label>
                  <Select value={morpheSourceVersion || "__NONE__"} onValueChange={(value) => setMorpheSourceVersion(value === "__NONE__" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("source.selectVersion")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                      {morpheSourceVersions.map((item) => (
                        <SelectItem key={`assets-morphe-version-${String(item.fileName)}-${String(item.tag || "")}`} value={String(item.fileName)}>
                          {item.fileName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className='self-end' onClick={onDownloadMorpheFromSource} disabled={morpheSourceDownloading || morpheSourceLoading || !hasText(morpheSourceVersion)}>
                  {morpheSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Download className='h-4 w-4' />}
                  {t("source.download")}
                </Button>
              </div>
              <div className='space-y-2'>
                {morpheLocalFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("morphe.noLocalFiles")}</p>
                ) : (
                  morpheLocalFiles.map((file) => (
                    <div key={`assets-morphe-file-${file.fullPath}`} className='flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2'>
                      <div className='min-w-0'>
                        <p className='text-sm font-medium break-all'>{file.name}</p>
                        <p className='text-xs text-muted-foreground break-all'>{file.relativePath}</p>
                      </div>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700'
                          disabled={morpheDeleteName === file.relativePath}
                          onClick={() => openConfirmDialog("delete-morphe-file", t("confirm.deleteMorpheTitle"), t("confirm.deleteMorpheDesc", { path: file.relativePath }), file)}>
                          {morpheDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
      </Card>

      <Card>
            <CardHeader className='py-3'>
              <CardTitle className='text-base flex items-center justify-between gap-2'>
                <span className='inline-flex items-center gap-2'>
                  <Package className='h-4 w-4' />
                  {t("assets.patches")}
                </span>
                <div className='flex items-center gap-2'>
                  <Button size='sm' variant='outline' onClick={() => setAddRepoDialogType("patches")}>
                    <Plus className='h-4 w-4' />
                    {t("source.addCustomRepo")}
                  </Button>
                  <Button size='sm' variant='outline' onClick={loadPatchesLocalFiles}>
                    <RefreshCw className='h-4 w-4' />
                    {t("action.refresh")}
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid gap-2 md:grid-cols-[1fr_1fr_auto]'>
                <div className='space-y-1'>
                  <Label>{t("source.repo")}</Label>
                  <Select value={hasText(patchesSourceRepo) ? patchesSourceRepo : "MorpheApp/morphe-patches"} onValueChange={onSelectPatchesSourceRepo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {patchesSourceRepoOptions.map((repo) => (
                        <SelectItem key={`assets-patches-repo-${repo}`} value={repo}>
                          {repo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1'>
                  <Label>{t("source.version")}</Label>
                  <Select value={patchesSourceVersion || "__NONE__"} onValueChange={(value) => setPatchesSourceVersion(value === "__NONE__" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("source.selectVersion")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__NONE__'>{t("source.noneSelected")}</SelectItem>
                      {patchesSourceVersions.map((item) => (
                        <SelectItem key={`assets-patches-version-${String(item.fileName)}-${String(item.tag || "")}`} value={String(item.fileName)}>
                          {item.fileName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className='self-end' onClick={onDownloadPatchesFromSource} disabled={patchesSourceDownloading || patchesSourceLoading || !hasText(patchesSourceVersion)}>
                  {patchesSourceDownloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <Download className='h-4 w-4' />}
                  {t("source.download")}
                </Button>
              </div>
              <div className='space-y-2'>
                {patchesLocalFiles.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t("patches.noLocalFiles")}</p>
                ) : (
                  patchesLocalFiles.map((file) => (
                    <div key={`assets-patches-file-${file.fullPath}`} className='flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2'>
                      <div className='min-w-0'>
                        <p className='text-sm font-medium break-all'>{file.name}</p>
                        <p className='text-xs text-muted-foreground break-all'>{file.relativePath}</p>
                      </div>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700'
                          disabled={patchesDeleteName === file.relativePath}
                          onClick={() => openConfirmDialog("delete-patches-file", t("confirm.deletePatchesTitle"), t("confirm.deletePatchesDesc", { path: file.relativePath }), file)}>
                          {patchesDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
      </Card>

      <Card>
            <CardHeader className='py-3'>
              <CardTitle className='text-base flex items-center justify-between gap-2'>
                <span className='inline-flex items-center gap-2'>
                  <Package className='h-4 w-4' />
                  {t("assets.apk")}
                </span>
                <Button size='sm' variant='outline' onClick={loadDownloadedApkFiles} disabled={downloadedApkLoading}>
                  {downloadedApkLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : <RefreshCw className='h-4 w-4' />}
                  {t("action.refresh")}
                </Button>
              </CardTitle>
              <p className='text-xs text-muted-foreground break-all'>{downloadedApkDir}</p>
            </CardHeader>
            <CardContent className='space-y-3'>
              {apkGroups.length === 0 ? (
                <p className='text-sm text-muted-foreground'>{t("assets.noApkFiles")}</p>
              ) : (
                apkGroups.map(([groupKey, files]) => {
                  const meta = sectionMetaMap[String(groupKey || "").toLowerCase()] || null
                  const icon = hasText(meta?.icon) ? String(meta.icon) : ""
                  const packageName = hasText(meta?.packageName) ? String(meta.packageName) : t("assets.unknownPackage")
                  const title = hasText(meta?.label) ? String(meta.label) : `[${groupKey}]`
                  return (
                    <div key={`apk-group-${groupKey}`} className='space-y-2 rounded-md border bg-background p-3'>
                      <div className='flex items-center gap-2'>
                        {hasText(icon) ? <img src={icon} alt={title} className='h-6 w-6 rounded-sm object-contain' /> : null}
                        <p className='text-sm font-semibold break-all'>{title}</p>
                      </div>
                      <p className='text-xs text-muted-foreground break-all'>{packageName}</p>
                      <div className='space-y-1'>
                        {files.map((file) => (
                          <div key={`apk-file-${file.fullPath}`} className='flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2'>
                            <div className='min-w-0'>
                              <p className='text-sm break-all'>{file.name}</p>
                              <p className='text-xs text-muted-foreground break-all'>{file.relativePath}</p>
                            </div>
                            <span className='text-xs text-muted-foreground'>{formatBytes(file.sizeBytes)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
      </Card>

      <Dialog open={addRepoOpen} onOpenChange={(open) => (!open ? setAddRepoDialogType("") : null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>{t("source.addCustomRepo")}</DialogTitle>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='assets-add-repo-input'>{t("source.repo")}</Label>
            <Input
              id='assets-add-repo-input'
              placeholder={t("source.customRepoPlaceholder")}
              value={addRepoDraft}
              onChange={(event) => {
                if (addRepoDialogType === "patches") {
                  setPatchesSourceRepoDraft(event.target.value)
                } else {
                  setMorpheSourceRepoDraft(event.target.value)
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                onConfirmAddRepo()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setAddRepoDialogType("")}>
              {t("action.cancel")}
            </Button>
            <Button onClick={onConfirmAddRepo} disabled={!hasText(addRepoDraft)}>
              {t("action.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
