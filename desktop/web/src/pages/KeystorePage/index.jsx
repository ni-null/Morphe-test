import { Check, Copy, Eye, FilePlus2, FolderOpen, KeyRound, Loader2, Trash2, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Textarea } from "../../components/ui/textarea"

function normalizeFiles(items) {
  if (!items) return []
  if (Array.isArray(items)) return items.filter(Boolean)
  return Array.from(items).filter(Boolean)
}

export default function KeystorePage({
  t,
  hasText,
  formatBytes,
  keystoreFiles,
  keystoreDeleteName,
  keystoreImporting,
  keystoreGenerating,
  keystoreViewing,
  keystorePreviewOpen,
  keystorePreviewData,
  onKeystorePreviewOpenChange,
  onImportKeystoreFiles,
  onGenerateKeystore,
  onViewKeystoreFile,
  openConfirmDialog,
  onOpenAssetsDir,
}) {
  const [dragActive, setDragActive] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef(null)

  const files = Array.isArray(keystoreFiles) ? keystoreFiles : []
  const isBusy = keystoreImporting || keystoreGenerating

  async function handleFiles(items) {
    const selected = normalizeFiles(items)
    if (selected.length === 0) return
    await onImportKeystoreFiles(selected)
  }

  async function onCopyBase64() {
    const value = String(keystorePreviewData?.base64 || "").trim()
    if (!value) return
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value)
      } else if (typeof document !== "undefined") {
        const element = document.createElement("textarea")
        element.value = value
        element.setAttribute("readonly", "")
        element.style.position = "absolute"
        element.style.left = "-9999px"
        document.body.appendChild(element)
        element.select()
        document.execCommand("copy")
        document.body.removeChild(element)
      }
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className='space-y-4'>
      <section className='space-y-2'>
        <div className='flex items-center justify-between gap-2 px-1'>
          <h2 className='text-base font-semibold flex items-center gap-2'>
            <KeyRound className='h-4 w-4' />
            {t("keystore.title")}
          </h2>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8'
            onClick={() => onOpenAssetsDir("keystore")}
            title={t("dialog.openTaskOutput")}
            aria-label={t("dialog.openTaskOutput")}>
            <FolderOpen className='h-4 w-4' />
          </Button>
        </div>
        <div className='space-y-2.5 rounded-xl bg-white p-3 dark:bg-slate-800/70'>
          <div
            className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
              dragActive
                ? "border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-900/20"
                : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/30"
            }`}
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              setDragActive(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              handleFiles(event.dataTransfer?.files || [])
            }}>
            <div className='flex flex-col items-center gap-2'>
              <Upload className='h-6 w-6 text-slate-500 dark:text-slate-300' />
              <p className='text-sm text-muted-foreground'>{t("keystore.dropHint")}</p>
              <div className='flex flex-wrap items-center justify-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={isBusy}
                  onClick={() => fileInputRef.current?.click()}>
                  {keystoreImporting ? <Loader2 className='h-4 w-4 animate-spin' /> : <FilePlus2 className='h-4 w-4' />}
                  {t("keystore.import")}
                </Button>
                <Button type='button' size='sm' disabled={isBusy} onClick={onGenerateKeystore}>
                  {keystoreGenerating ? <Loader2 className='h-4 w-4 animate-spin' /> : <KeyRound className='h-4 w-4' />}
                  {t("keystore.generate")}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type='file'
                multiple
                accept='.keystore,application/octet-stream'
                className='hidden'
                onChange={(event) => {
                  handleFiles(event.target.files || [])
                  event.target.value = ""
                }}
              />
            </div>
          </div>

          <div className='space-y-2'>
            <p className='text-sm text-muted-foreground'>{t("keystore.listDesc", { count: files.length })}</p>
            {files.length === 0 ? (
              <p className='text-sm text-muted-foreground'>{t("settings.noKeystore")}</p>
            ) : (
              <div className='assets-scroll max-h-[56vh] space-y-1 overflow-y-auto rounded-lg p-2 pr-1'>
                {files.map((file) => {
                  const relativePath = String(file?.relativePath || file?.name || "").trim()
                  const isDeleting = keystoreDeleteName === relativePath
                  return (
                    <div key={`keystore-file-${file.fullPath}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5'>
                      <div className='min-w-0'>
                        <div className='flex min-w-0 items-center gap-2 text-sm'>
                          <span className='truncate font-medium'>{file?.name || file?.fileName || ""}</span>
                          <span className='shrink-0 whitespace-nowrap text-xs text-muted-foreground'>{formatBytes(file?.sizeBytes || 0)}</span>
                        </div>
                        {hasText(file?.relativePath) ? (
                          <p className='truncate text-xs text-muted-foreground/70'>{file.relativePath}</p>
                        ) : null}
                      </div>
                      <div className='flex items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7'
                          disabled={keystoreViewing === relativePath}
                          onClick={() => onViewKeystoreFile(file)}
                          title={t("keystore.view")}>
                          {keystoreViewing === relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Eye className='h-4 w-4' />}
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                          disabled={isDeleting}
                          onClick={() =>
                            openConfirmDialog(
                              "delete-keystore-file",
                              t("confirm.deleteKeystoreTitle"),
                              t("confirm.deleteKeystoreDesc", { path: relativePath }),
                              file,
                            )
                          }>
                          {isDeleting ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      <Dialog
        open={keystorePreviewOpen}
        onOpenChange={(open) => {
          if (!open) setCopied(false)
          onKeystorePreviewOpenChange(open)
        }}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("keystore.previewTitle")}</DialogTitle>
            <DialogDescription>
              {hasText(keystorePreviewData?.fileName) ? keystorePreviewData.fileName : ""}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div>
              <div className='mb-1 flex items-center justify-between gap-2'>
                <p className='text-xs font-medium text-muted-foreground'>{t("keystore.base64")}</p>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 px-2 text-xs'
                  disabled={!hasText(keystorePreviewData?.base64)}
                  onClick={onCopyBase64}>
                  {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                  {copied ? t("keystore.copied") : t("keystore.copy")}
                </Button>
              </div>
              <Textarea
                readOnly
                className='min-h-40 font-mono text-xs'
                value={String(keystorePreviewData?.base64 || "")}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
