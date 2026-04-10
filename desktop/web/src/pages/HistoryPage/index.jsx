import { Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import HistoryTaskList from "./components/HistoryTaskList"

export default function HistoryPage({
  t,
  openConfirmDialog,
  clearingAllCache,
  deletingAllTasks,
  refreshTasks,
  isBusy,
  tasks,
  formatTaskLabel,
  statusVariant,
  deletingTaskId,
  onOpenTaskOutputDir,
  openingTaskFolder,
  onOpenTaskLog,
}) {
  return (
    <div className='space-y-2'>
      <section className='space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2 px-1'>
          <div>
            <h2 className='text-base font-semibold'>{t("history.title")}</h2>
            <p className='text-sm text-muted-foreground'>{t("history.desc")}</p>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              onClick={() => openConfirmDialog("clear-all-cache", t("confirm.clearCacheTitle"), t("confirm.clearCacheDesc"))}
              disabled={clearingAllCache}
              className='border-0 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200'>
              {clearingAllCache ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
              {t("history.clearCache")}
            </Button>
            <Button
              variant='ghost'
              onClick={() => openConfirmDialog("delete-all-tasks", t("confirm.deleteAllTasksTitle"), t("confirm.deleteAllTasksDesc"))}
              disabled={deletingAllTasks}
              className='border-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200'>
              {deletingAllTasks ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
              {t("history.deleteAll")}
            </Button>
            <Button variant='ghost' className='border-0' onClick={refreshTasks} disabled={isBusy}>
              <RefreshCw className='h-4 w-4' />
              {t("history.refresh")}
            </Button>
          </div>
        </div>
        <div className='rounded-xl bg-white p-2.5 dark:bg-slate-800/70'>
          <HistoryTaskList
            t={t}
            tasks={tasks}
            formatTaskLabel={formatTaskLabel}
            statusVariant={statusVariant}
            onOpenTaskLog={onOpenTaskLog}
            onOpenTaskOutputDir={onOpenTaskOutputDir}
            openingTaskFolder={openingTaskFolder}
            openConfirmDialog={openConfirmDialog}
            deletingTaskId={deletingTaskId}
          />
        </div>
      </section>
    </div>
  )
}
