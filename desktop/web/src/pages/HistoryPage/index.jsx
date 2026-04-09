import { Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
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
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <CardTitle>{t("history.title")}</CardTitle>
              <CardDescription>{t("history.desc")}</CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                onClick={() => openConfirmDialog("clear-all-cache", t("confirm.clearCacheTitle"), t("confirm.clearCacheDesc"))}
                disabled={clearingAllCache}
                className='border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200'>
                {clearingAllCache ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                {t("history.clearCache")}
              </Button>
              <Button
                variant='outline'
                onClick={() => openConfirmDialog("delete-all-tasks", t("confirm.deleteAllTasksTitle"), t("confirm.deleteAllTasksDesc"))}
                disabled={deletingAllTasks}
                className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40 dark:hover:text-red-200'>
                {deletingAllTasks ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                {t("history.deleteAll")}
              </Button>
              <Button variant='outline' onClick={refreshTasks} disabled={isBusy}>
                <RefreshCw className='h-4 w-4' />
                {t("history.refresh")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
