import { FolderOpen, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

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
                className='border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800'>
                {clearingAllCache ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                {t("history.clearCache")}
              </Button>
              <Button
                variant='outline'
                onClick={() => openConfirmDialog("delete-all-tasks", t("confirm.deleteAllTasksTitle"), t("confirm.deleteAllTasksDesc"))}
                disabled={deletingAllTasks}
                className='border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700'>
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
          <div className='grid gap-2 max-h-[520px] overflow-auto'>
            {tasks.map((task) => {
              return (
                <div key={task.id} className='w-full'>
                  <div
                    className='rounded-md border px-3 py-2 cursor-pointer'
                    role='button'
                    tabIndex={0}
                    onClick={() => onOpenTaskLog(task.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onOpenTaskLog(task.id)
                      }
                    }}>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='text-sm flex-1 min-w-0 break-all'>{formatTaskLabel(task)}</span>
                      <div className='flex items-center gap-1 shrink-0'>
                        <Badge variant={statusVariant(task.status)} className='text-xs'>{task.status || "unknown"}</Badge>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenTaskOutputDir(task.id)
                          }}
                          disabled={openingTaskFolder}
                          title={t("dialog.openTaskOutput")}
                          aria-label={t("dialog.openTaskOutput")}
                          className='h-7 w-7 text-muted-foreground hover:text-foreground'>
                          {openingTaskFolder ? <Loader2 className='h-4 w-4 animate-spin' /> : <FolderOpen className='h-4 w-4' />}
                        </Button>
                        <Button
                          variant='ghost'
                          size='icon'
                          onClick={(event) => {
                            event.stopPropagation()
                            openConfirmDialog("delete-task", t("confirm.deleteTaskTitle"), t("confirm.deleteTaskDesc", { id: task.id }), task.id)
                          }}
                          disabled={deletingTaskId === task.id}
                          title={t("history.deleteTask")}
                          aria-label={t("history.deleteTask")}
                          className='h-7 w-7 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                          {deletingTaskId === task.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
