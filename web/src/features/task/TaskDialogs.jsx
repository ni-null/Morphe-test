import { Loader2 } from "lucide-react"
import { Badge } from "../../components/ui/badge"
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
}) {
  return (
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
  )
}
