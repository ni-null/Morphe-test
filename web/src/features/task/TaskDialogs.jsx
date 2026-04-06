import { FolderOpen, Loader2, ScrollText } from "lucide-react"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"

export default function TaskDialogs({
  t,
  logDialogOpen,
  setLogDialogOpen,
  liveTaskId,
  liveTaskStatus,
  statusVariant,
  liveLastLine,
  liveTaskLog,
  historyLogDialogOpen,
  setHistoryLogDialogOpen,
  selectedTaskId,
  taskLog,
  taskDetailDialogOpen,
  setTaskDetailDialogOpen,
  taskOutputDir,
  selectedTask,
  onOpenSelectedTaskOutputDir,
  openingTaskFolder,
  taskArtifacts,
  formatBytes,
  onOpenArtifactDir,
  openingArtifactPath,
}) {
  return (
    <>
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("dialog.currentProgress")}</DialogTitle>
            <DialogDescription>{liveTaskId ? t("dialog.taskId", { id: liveTaskId }) : t("dialog.noLiveTask")}</DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Badge variant={statusVariant(liveTaskStatus || "outline")}>{liveTaskStatus || "idle"}</Badge>
              {liveTaskStatus === "running" ? (
                <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  {t("dialog.running")}
                </span>
              ) : null}
            </div>

            <div className='rounded-md border bg-muted/30 p-3'>
              <p className='text-xs text-muted-foreground'>{t("dialog.latestProgress")}</p>
              <p className='mt-1 text-sm break-all'>{liveLastLine || t("build.waiting")}</p>
            </div>

            <pre className='mono-box max-h-[420px]'>{liveTaskLog || t("dialog.noLog")}</pre>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyLogDialogOpen} onOpenChange={setHistoryLogDialogOpen}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("dialog.taskLogTail")}</DialogTitle>
            <DialogDescription>{selectedTaskId ? t("dialog.taskId", { id: selectedTaskId }) : t("dialog.noTaskSelected")}</DialogDescription>
          </DialogHeader>
          <pre className='mono-box max-h-[420px]'>{taskLog || t("dialog.noLog")}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={taskDetailDialogOpen} onOpenChange={setTaskDetailDialogOpen}>
        <DialogContent className='max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{t("dialog.taskInfo")}</DialogTitle>
            <DialogDescription>{selectedTaskId ? t("dialog.taskId", { id: selectedTaskId }) : t("dialog.noTaskSelected")}</DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='text-xs text-muted-foreground break-all min-w-0'>{taskOutputDir || selectedTask?.taskOutputDir || selectedTask?.taskLogPath || "-"}</div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => setHistoryLogDialogOpen(true)}
                  disabled={!selectedTaskId}
                  title={t("dialog.viewTaskLog")}
                  aria-label={t("dialog.viewTaskLog")}>
                  <ScrollText className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='icon'
                  onClick={onOpenSelectedTaskOutputDir}
                  disabled={!selectedTaskId || openingTaskFolder}
                  title={t("dialog.openTaskOutput")}
                  aria-label={t("dialog.openTaskOutput")}>
                  {openingTaskFolder ? <Loader2 className='h-4 w-4 animate-spin' /> : <FolderOpen className='h-4 w-4' />}
                </Button>
              </div>
            </div>

            <div className='space-y-2 max-h-[420px] overflow-auto pr-1'>
              {taskArtifacts.length > 0 ? (
                taskArtifacts.map((item) => (
                  <div key={item.fullPath} className='flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2'>
                    <div className='min-w-0'>
                      <p className='text-sm font-medium break-all'>{item.fileName}</p>
                      <p className='text-xs text-muted-foreground break-all'>{item.relativePath}</p>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Badge variant='outline'>{formatBytes(item.sizeBytes)}</Badge>
                      <Button
                        variant='outline'
                        size='icon'
                        onClick={() => onOpenArtifactDir(item.relativePath)}
                        disabled={openingArtifactPath === item.relativePath}
                        title={t("dialog.openArtifactDir")}
                        aria-label={`${t("dialog.openArtifactDir")}: ${item.fileName}`}>
                        {openingArtifactPath === item.relativePath ? <Loader2 className='h-4 w-4 animate-spin' /> : <FolderOpen className='h-4 w-4' />}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>{t("dialog.noArtifacts")}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
