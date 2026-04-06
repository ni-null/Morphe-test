import { Loader2, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { cn } from "../lib/utils"

export default function HistoryPage({
  t,
  openConfirmDialog,
  clearingAllCache,
  deletingAllTasks,
  refreshTasks,
  isBusy,
  tasks,
  selectedTaskId,
  setSelectedTaskId,
  setTaskDetailDialogOpen,
  formatTaskLabel,
  statusVariant,
  deletingTaskId,
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
            {tasks.map((task) => (
              <div
                role='button'
                tabIndex={0}
                key={task.id}
                className={cn("w-full rounded-md border px-3 py-2 text-left transition hover:bg-accent", selectedTaskId === task.id && "border-primary bg-primary/5")}
                onClick={() => {
                  setSelectedTaskId(task.id)
                  setTaskDetailDialogOpen(true)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    setSelectedTaskId(task.id)
                    setTaskDetailDialogOpen(true)
                  }
                }}>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-sm'>{formatTaskLabel(task)}</span>
                  <div className='flex items-center gap-2'>
                    <Badge variant={statusVariant(task.status)}>{task.status || "unknown"}</Badge>
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
                      className='h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700'>
                      {deletingTaskId === task.id ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

