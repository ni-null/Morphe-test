import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from "lucide-react"
import { Badge } from "../ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog"

function resolveStatusVisual(taskStatus) {
  const normalized = String(taskStatus || "").trim().toLowerCase()
  if (normalized === "running" || normalized === "stopping") {
    return {
      Icon: Loader2,
      iconClassName: "h-3.5 w-3.5 animate-spin",
      badgeClassName: undefined,
    }
  }
  if (normalized === "completed") {
    return {
      Icon: CheckCircle2,
      iconClassName: "h-3.5 w-3.5",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }
  }
  if (normalized === "failed") {
    return {
      Icon: AlertCircle,
      iconClassName: "h-3.5 w-3.5",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
    }
  }
  return {
    Icon: MinusCircle,
    iconClassName: "h-3.5 w-3.5",
    badgeClassName: undefined,
  }
}

function resolveLogLevelClass(level) {
  const normalized = String(level || "").trim().toUpperCase()
  if (normalized === "ERROR" || normalized === "FATAL") return "text-red-300"
  if (normalized === "WARN" || normalized === "WARNING") return "text-amber-300"
  if (normalized === "INFO") return "text-sky-300"
  if (normalized === "DEBUG" || normalized === "TRACE") return "text-violet-300"
  return "text-slate-300"
}

function parseLogLine(line) {
  const text = String(line || "")
  const matched = text.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+\[([^\]]+)\]\s*(.*)$/u)
  if (!matched) {
    return {
      time: "",
      level: "",
      message: text,
      matched: false,
    }
  }
  return {
    time: String(matched[1] || ""),
    level: String(matched[2] || ""),
    message: String(matched[3] || ""),
    matched: true,
  }
}

export default function TaskDialogs({
  t,
  logDialogOpen,
  setLogDialogOpen,
  taskId,
  taskStatus,
  statusVariant,
  taskLog,
}) {
  const { Icon, iconClassName, badgeClassName } = resolveStatusVisual(taskStatus)
  const lines = String(taskLog || "")
    .split(/\r?\n/u)
    .map((line) => String(line))

  return (
    <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
      <DialogContent className='max-w-4xl' showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className='flex items-center justify-between gap-2'>
            <span className='min-w-0 truncate'>{taskId ? t("dialog.taskId", { id: taskId }) : t("dialog.noTaskSelected")}</span>
            <Badge variant={statusVariant(taskStatus || "outline")} className={badgeClassName}>
              <Icon className={iconClassName} />
              {taskStatus || "idle"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className='mono-box max-h-[420px] overflow-auto'>
          {lines.length === 0 || (lines.length === 1 && lines[0] === "") ? (
            <span className='text-slate-300'>{t("dialog.noLog")}</span>
          ) : (
            lines.map((line, index) => {
              const parsed = parseLogLine(line)
              if (!parsed.matched) {
                return (
                  <div key={`task-log-line-${index}`} className='whitespace-pre-wrap break-words text-slate-200'>
                    {parsed.message}
                  </div>
                )
              }
              return (
                <div key={`task-log-line-${index}`} className='whitespace-pre-wrap break-words'>
                  <span className='text-cyan-300'>{parsed.time}</span>
                  <span className='text-slate-500'> </span>
                  <span className={resolveLogLevelClass(parsed.level)}>[{parsed.level}]</span>
                  <span className='text-slate-500'> </span>
                  <span className='text-slate-100'>{parsed.message}</span>
                </div>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
