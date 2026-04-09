import { useMemo, useState } from "react"

export default function useTaskDialogState({
  liveTaskId,
  liveTask,
  liveTaskStatus,
  liveTaskLog,
  selectedTaskId,
  selectedTask,
  tasks,
  taskLogs,
  setSelectedTaskId,
  setLogDialogOpen,
}) {
  const [logDialogTaskId, setLogDialogTaskId] = useState("")

  const selectedTaskLog = String(taskLogs[selectedTaskId] || "")
  const dialogTargetTaskId = String(logDialogTaskId || liveTaskId || selectedTaskId || "").trim()
  const dialogTargetTask = useMemo(() => {
    if (!dialogTargetTaskId) return null
    if (String(liveTaskId || "") === dialogTargetTaskId && liveTask) return liveTask
    if (selectedTask && String(selectedTask.id || "") === dialogTargetTaskId) return selectedTask
    return tasks.find((task) => String(task?.id || "") === dialogTargetTaskId) || null
  }, [dialogTargetTaskId, liveTaskId, liveTask, selectedTask, tasks])
  const dialogTargetStatus = String(String(liveTaskId || "") === dialogTargetTaskId ? liveTaskStatus : dialogTargetTask?.status || "")
  const dialogTargetLog = String(
    String(liveTaskId || "") === dialogTargetTaskId ? liveTaskLog : taskLogs[dialogTargetTaskId] || selectedTaskLog || "",
  )

  function onOpenLogDialog(taskId = "") {
    const target = String(taskId || "").trim()
    const fallback = String(liveTaskId || selectedTaskId || "").trim()
    const resolved = target || fallback
    if (!resolved) {
      setLogDialogTaskId("")
      setLogDialogOpen(true)
      return
    }
    if (target) {
      setSelectedTaskId(target)
    }
    setLogDialogTaskId(resolved)
    setLogDialogOpen(true)
  }

  function onLogDialogOpenChange(open) {
    setLogDialogOpen(open)
    if (!open) {
      setLogDialogTaskId("")
    }
  }

  return {
    dialogTargetTaskId,
    dialogTargetStatus,
    dialogTargetLog,
    onOpenLogDialog,
    onLogDialogOpenChange,
  }
}
