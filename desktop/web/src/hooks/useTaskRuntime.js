import { useEffect, useState } from "react"

export default function useTaskRuntime({
  t,
  setMessage,
  isBuildTask,
  isNotFoundError,
  listTasks,
  fetchTask,
  fetchTaskLog,
  fetchTaskArtifacts,
  deleteTask,
  deleteAllTasks,
  clearAllCache,
  openTaskOutputDir,
  openTaskArtifactDir,
}) {
  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState("")
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskLogs, setTaskLogs] = useState({})
  const [taskArtifacts, setTaskArtifacts] = useState([])
  const [taskOutputDir, setTaskOutputDir] = useState("")
  const [deletingAllTasks, setDeletingAllTasks] = useState(false)
  const [clearingAllCache, setClearingAllCache] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState("")
  const [openingTaskFolder, setOpeningTaskFolder] = useState(false)
  const [openingArtifactPath, setOpeningArtifactPath] = useState("")
  const [liveTaskId, setLiveTaskId] = useState("")
  const [liveTask, setLiveTask] = useState(null)
  const [liveTaskLog, setLiveTaskLog] = useState("")

  async function refreshTasks() {
    const data = await listTasks(80)
    const next = Array.isArray(data.tasks) ? data.tasks : []
    setTasks(next)
    if (!selectedTaskId && next.length > 0) setSelectedTaskId(next[0].id)

    const activeBuild = next.find((task) => {
      const status = String(task.status || "").toLowerCase()
      return isBuildTask(task) && (status === "running" || status === "stopping")
    })
    const currentLive = liveTaskId ? next.find((task) => String(task.id || "") === String(liveTaskId)) : null
    const currentLiveStatus = String(currentLive?.status || "").toLowerCase()
    const currentLiveFinished = !!currentLive && !["running", "stopping"].includes(currentLiveStatus)
    if (activeBuild) {
      setLiveTaskId(activeBuild.id)
      setLiveTask(activeBuild)
      if (!selectedTaskId) {
        setSelectedTaskId(activeBuild.id)
      }
      return
    }

    if (currentLive) {
      setLiveTask(currentLive)
      if (currentLiveFinished) {
        setLiveTaskId("")
      }
      return
    }

    if (liveTaskId) {
      setLiveTaskId("")
      setLiveTask(null)
    }
  }

  async function onOpenSelectedTaskOutputDir() {
    if (!selectedTaskId) return
    setOpeningTaskFolder(true)
    try {
      await openTaskOutputDir(selectedTaskId)
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setOpeningTaskFolder(false)
    }
  }

  async function onOpenArtifactDir(relativePath) {
    if (!selectedTaskId || !relativePath) return
    setOpeningArtifactPath(relativePath)
    try {
      await openTaskArtifactDir(selectedTaskId, relativePath)
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setOpeningArtifactPath("")
    }
  }

  async function onDeleteTask(taskId) {
    if (!taskId) return
    setDeletingTaskId(taskId)
    try {
      await deleteTask(taskId)
      if (selectedTaskId === taskId) {
        setSelectedTaskId("")
        setSelectedTask(null)
        setTaskLogs((prev) => {
          const next = { ...prev }
          delete next[String(taskId || "")]
          return next
        })
        setTaskArtifacts([])
        setTaskOutputDir("")
      }
      setMessage(t("msg.deletedTask", { id: taskId }))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setDeletingTaskId("")
    }
  }

  async function onDeleteAllTasks() {
    setDeletingAllTasks(true)
    try {
      await deleteAllTasks()
      setSelectedTaskId("")
      setSelectedTask(null)
      setTaskLogs({})
      setTaskArtifacts([])
      setTaskOutputDir("")
      setMessage(t("msg.deletedAllTasks"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setDeletingAllTasks(false)
    }
  }

  async function onClearAllCache() {
    setClearingAllCache(true)
    try {
      const data = await clearAllCache()
      setMessage(t("msg.cacheCleared", { path: data.path || "-" }))
    } catch (error) {
      setMessage(error.message || String(error), "error")
    } finally {
      setClearingAllCache(false)
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      refreshTasks().catch(() => {})
    }, 4000)
    return () => clearInterval(timer)
  }, [selectedTaskId])

  useEffect(() => {
    if (!selectedTaskId) return undefined

    let canceled = false
    async function refreshSelected() {
      try {
        const [taskRes, logRes, artifactsRes] = await Promise.allSettled([
          fetchTask(selectedTaskId),
          fetchTaskLog(selectedTaskId, 500),
          fetchTaskArtifacts(selectedTaskId),
        ])
        if (canceled) return

        if (taskRes.status === "fulfilled") {
          const selected = taskRes.value.task || null
          if (!selected) {
            setSelectedTaskId("")
            setSelectedTask(null)
            setTaskLogs((prev) => {
              const next = { ...prev }
              delete next[selectedTaskId]
              return next
            })
            setTaskArtifacts([])
            setTaskOutputDir("")
            return
          }
          setSelectedTask(selected)
        } else if (isNotFoundError(taskRes.reason)) {
          setSelectedTaskId("")
          setSelectedTask(null)
          setTaskLogs((prev) => {
            const next = { ...prev }
            delete next[selectedTaskId]
            return next
          })
          setTaskArtifacts([])
          setTaskOutputDir("")
          return
        } else {
          setMessage(taskRes.reason?.message || String(taskRes.reason), "error")
        }

        if (logRes.status === "fulfilled") {
          setTaskLogs((prev) => ({ ...prev, [selectedTaskId]: String(logRes.value?.content || "") }))
        }
        if (artifactsRes.status === "fulfilled") {
          setTaskArtifacts(Array.isArray(artifactsRes.value?.artifacts) ? artifactsRes.value.artifacts : [])
          setTaskOutputDir(String(artifactsRes.value?.outputDir || ""))
        }
      } catch (error) {
        if (canceled) return
        if (isNotFoundError(error)) {
          setSelectedTaskId("")
          setSelectedTask(null)
          setTaskLogs((prev) => {
            const next = { ...prev }
            delete next[selectedTaskId]
            return next
          })
          setTaskArtifacts([])
          setTaskOutputDir("")
          return
        }
        setMessage(error.message || String(error), "error")
      }
    }

    refreshSelected()
    const timer = setInterval(refreshSelected, 2000)
    return () => {
      canceled = true
      clearInterval(timer)
    }
  }, [selectedTaskId, fetchTask, fetchTaskLog, fetchTaskArtifacts, isNotFoundError, setMessage])

  useEffect(() => {
    if (!liveTaskId) return undefined

    let canceled = false
    async function refreshLiveTask() {
      try {
        const taskData = await fetchTask(liveTaskId)
        if (canceled) return
        const nextTask = taskData.task || null
        if (!nextTask) {
          setLiveTaskId("")
          setLiveTask(null)
          setLiveTaskLog("")
          return
        }
        const nextStatus = String(nextTask?.status || "").toLowerCase()
        setLiveTask(nextTask)
        try {
          const logData = await fetchTaskLog(liveTaskId, 500)
          if (!canceled) {
            setLiveTaskLog(String(logData?.content || ""))
          }
        } catch {
          // Keep status syncing even if log fetch is temporarily unavailable.
        }
        if (nextTask && !["running", "stopping"].includes(nextStatus)) {
          setLiveTaskId("")
        }
      } catch (error) {
        if (canceled) return
        if (isNotFoundError(error)) {
          setLiveTaskId("")
          setLiveTask(null)
          setLiveTaskLog("")
          return
        }
        setMessage(error.message || String(error), "error")
      }
    }

    refreshLiveTask()
    const timer = setInterval(refreshLiveTask, 1500)
    return () => {
      canceled = true
      clearInterval(timer)
    }
  }, [liveTaskId, fetchTask, fetchTaskLog, isNotFoundError, setMessage])

  return {
    tasks,
    selectedTaskId,
    setSelectedTaskId,
    selectedTask,
    setSelectedTask,
    taskLogs,
    setTaskLogs,
    taskArtifacts,
    setTaskArtifacts,
    taskOutputDir,
    setTaskOutputDir,
    deletingAllTasks,
    clearingAllCache,
    deletingTaskId,
    openingTaskFolder,
    openingArtifactPath,
    liveTaskId,
    setLiveTaskId,
    liveTask,
    setLiveTask,
    liveTaskLog,
    setLiveTaskLog,
    refreshTasks,
    onOpenSelectedTaskOutputDir,
    onOpenArtifactDir,
    onDeleteTask,
    onDeleteAllTasks,
    onClearAllCache,
  }
}
