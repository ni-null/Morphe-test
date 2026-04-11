import { Cloud, FlaskConical, HardDrive, Loader2, Settings2, Trash2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group"
import { cn } from "../../../lib/utils"

export default function EngineSettingsDialog({
  open,
  onOpenChange,
  t,
  configForm,
  engineLocalFiles,
  engineRemoteStableValue,
  engineRemoteDevValue,
  updateConfigSection,
  formatBytes,
  openConfirmDialog,
  engineDeleteName,
}) {
  const currentEngineStableValue = String(engineRemoteStableValue || "").trim()
  const currentEngineDevValue = String(engineRemoteDevValue || "").trim()
  const currentEngineLocalFiles = Array.isArray(engineLocalFiles) ? engineLocalFiles : []
  const currentEngineDeleteName = typeof engineDeleteName === "string" ? engineDeleteName : ""
  const patchCliConfig = configForm?.patchCli || {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl h-[500px] md:h-[540px] overflow-hidden flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Settings2 className='h-4 w-4' />
            {t("engine.settings")}
          </DialogTitle>
        </DialogHeader>
        <div className='mt-3 flex-1 overflow-y-auto pr-1 space-y-3'>
          <div className='space-y-2 rounded-md bg-muted/40 p-3'>
            <RadioGroup
              value={
                patchCliConfig.mode === "dev"
                  ? currentEngineDevValue
                  : patchCliConfig.mode === "stable"
                    ? currentEngineStableValue
                    : patchCliConfig.path || "__NONE__"
              }
              onValueChange={(value) => {
                if (value === currentEngineStableValue) {
                  updateConfigSection("patchCli", { mode: "stable" })
                  return
                }
                if (value === currentEngineDevValue) {
                  updateConfigSection("patchCli", { mode: "dev" })
                  return
                }
                updateConfigSection("patchCli", { mode: "local", path: value === "__NONE__" ? "" : value })
              }}
              className='grid gap-2 space-y-1 max-h-[440px] overflow-auto'>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patchCli", { mode: "stable" })}>
                  <RadioGroupItem value={currentEngineStableValue} className='mt-0.5' />
                  <Cloud className='mt-0.5 h-4 w-4 text-sky-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>stable engine-cli</span>
                  </span>
                </label>
              </div>
              <div className='flex items-center gap-2 rounded-md bg-background/80 px-2 py-1 transition-colors hover:bg-muted/70'>
                <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patchCli", { mode: "dev" })}>
                  <RadioGroupItem value={currentEngineDevValue} className='mt-0.5' />
                  <FlaskConical className='mt-0.5 h-4 w-4 text-amber-700' />
                  <span className='min-w-0'>
                    <span className='block text-xs font-medium break-all'>dev engine-cli</span>
                  </span>
                </label>
              </div>
              {currentEngineLocalFiles.length > 0 ? (
                currentEngineLocalFiles.map((file) => (
                  <div
                    key={`engine-row-${file.fullPath}`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1 transition-colors",
                      patchCliConfig.path === file.fullPath ? "bg-sky-100/90 text-sky-950" : "bg-background/80 hover:bg-muted/70",
                    )}>
                    <label className='flex min-w-0 flex-1 items-start gap-2 cursor-pointer' onClick={() => updateConfigSection("patchCli", { path: file.fullPath })}>
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
                        openConfirmDialog("delete-engine-file", t("confirm.deleteEngineTitle"), t("confirm.deleteEngineDesc", { path: file.relativePath }), file)
                      }}
                      disabled={currentEngineDeleteName === file.relativePath}
                      className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200'>
                      {currentEngineDeleteName === file.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-xs text-muted-foreground'>{t("engine.noLocalFiles")}</p>
              )}
            </RadioGroup>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
