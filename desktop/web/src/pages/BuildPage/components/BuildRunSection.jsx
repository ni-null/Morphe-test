import { useEffect, useMemo, useState } from "react"
import { FileText, Play, Square } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"

export default function BuildRunSection({
  t,
  isBuildRunning,
  buildLaunchPending,
  isBuildStopping,
  liveTaskStartedAt,
  buildProgressStages,
  buildPreviewLine,
  onOpenLogDialog,
  liveTaskId,
  onStopBuildTask,
  onBuildPrimaryAction,
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const isWorking = isBuildRunning || buildLaunchPending || isBuildStopping

  useEffect(() => {
    if (!isWorking) return undefined
    const timer = globalThis.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => globalThis.clearInterval(timer)
  }, [isWorking])

  const elapsedSeconds = useMemo(() => {
    const startMs = Date.parse(String(liveTaskStartedAt || ""))
    if (!Number.isFinite(startMs) || startMs <= 0) return 0
    const diffMs = Math.max(0, nowMs - startMs)
    return Math.floor(diffMs / 1000)
  }, [liveTaskStartedAt, nowMs])

  return (
    <div className='sticky bottom-0 z-10 mt-2 rounded-md bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85'>
      {isBuildRunning || buildLaunchPending || isBuildStopping ? (
        <div className='flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm'>
          <div className='inline-flex shrink-0 items-center gap-1'>
            {(Array.isArray(buildProgressStages) ? buildProgressStages : []).map((stage) => (
              <span
                key={`build-stage-${stage.key}`}
                title={stage.label}
                className={cn(
                  "h-3.5 w-3.5 cursor-help rounded-[3px] transition-colors",
                  stage.state === "active" && "bg-sky-500 animate-pulse [animation-duration:0.7s]",
                  stage.state === "done"
                    ? "bg-sky-200 hover:bg-sky-300 dark:bg-sky-700/60 dark:hover:bg-sky-600/70"
                    : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600",
                )}
              />
            ))}
          </div>
          <span className='shrink-0 text-xs text-muted-foreground'>{isBuildStopping ? t("build.stopping") : t("dialog.running")}</span>
          <span className='min-w-0 flex-1 truncate text-xs text-muted-foreground'>{buildPreviewLine}</span>
          <div className='flex shrink-0 items-center gap-2'>
            <span className='shrink-0 text-xs tabular-nums text-muted-foreground'>{`${elapsedSeconds}s`}</span>
            <Button
              variant='ghost'
              size='icon'
              className='border-0 bg-white/70 hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-700'
              onClick={onOpenLogDialog}
              disabled={!liveTaskId}
              aria-label={t("build.openCurrentLog")}
              title={t("build.openCurrentLog")}>
              <FileText className='h-5 w-5' />
            </Button>
            <Button
              variant='ghost'
              onClick={onStopBuildTask}
              disabled={!liveTaskId || (!isBuildRunning && !isBuildStopping)}
              className='border-0 bg-white/70 text-red-600 hover:bg-red-50 hover:text-red-700 dark:bg-slate-800/80 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300'>
              <Square className='h-5 w-5' />
              {isBuildStopping ? t("build.stopping") : t("build.stop")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          className='w-full border-0 shadow-none bg-slate-700 text-white hover:bg-slate-600 dark:bg-slate-300 dark:text-slate-900 dark:hover:bg-slate-200'
          variant='default'
          onClick={onBuildPrimaryAction}>
          <Play className='h-5 w-5' />
          {t("build.start")}
        </Button>
      )}
    </div>
  )
}
