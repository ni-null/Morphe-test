import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export default function useBuildExecutionState({
  activeNav,
  navBuildKey,
  tasks,
  liveTask,
  setLiveTask,
  liveTaskId,
  setLiveTaskId,
  liveTaskLog,
  selectedTaskId,
  setSelectedTaskId,
  buildLaunchPending,
  setBuildLaunchPending,
  setIsBusy,
  configPath,
  selectedKeystorePath,
  t,
  hasText,
  buildTaskPayload,
  startTask,
  stopTask,
  refreshTasks,
  fetchTaskArtifacts,
  openTaskArtifactDir,
  setMessage,
  buildStageDefinitions,
  detectBuildStageIndexFromLine,
}) {
  const [buildGeneratedApks, setBuildGeneratedApks] = useState([])
  const [buildGeneratedApksLoading, setBuildGeneratedApksLoading] = useState(false)
  const buildGeneratedApksSigRef = useRef("")

  const liveTaskStatus = String(liveTask?.status || "")
  const isBuildRunning = liveTaskStatus.toLowerCase() === "running"
  const isBuildStopping = liveTaskStatus.toLowerCase() === "stopping"

  const liveLastLine = useMemo(() => {
    const lines = String(liveTaskLog || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.length > 0 ? lines[lines.length - 1] : ""
  }, [liveTaskLog])

  const buildProgressStages = useMemo(() => {
    const status = String(liveTask?.status || "").toLowerCase()
    const isWorking = buildLaunchPending || status === "running" || status === "stopping"
    const isFailed = status === "failed" || status === "canceled"
    const isCompleted = status === "completed"

    const lines = String(liveTaskLog || "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)

    let furthestStageIndex = -1
    for (const line of lines) {
      const stageIndex = detectBuildStageIndexFromLine(line)
      if (stageIndex > furthestStageIndex) {
        furthestStageIndex = stageIndex
      }
    }

    const currentIndex = furthestStageIndex >= 0 ? furthestStageIndex : isWorking ? 0 : -1
    return buildStageDefinitions.map((stage, index) => {
      let state = "pending"
      if (isCompleted) {
        state = index <= Math.max(currentIndex, 3) ? "done" : "pending"
      } else if (isFailed) {
        if (index < currentIndex) state = "done"
        if (index === currentIndex) state = "error"
      } else if (isWorking) {
        if (index < currentIndex) state = "done"
        if (index === currentIndex) state = "active"
      }
      return {
        key: stage.key,
        label: t(stage.labelKey),
        state,
      }
    })
  }, [buildLaunchPending, liveTask?.status, liveTaskLog, detectBuildStageIndexFromLine, buildStageDefinitions, t])

  async function runBuildTask(flags = { dryRun: false, force: false }) {
    const isBuildRunningNow = String(liveTask?.status || "").toLowerCase() === "running"
    if (isBuildRunningNow || buildLaunchPending) {
      setMessage(t("msg.buildAlreadyRunning"))
      return
    }
    setIsBusy(true)
    setBuildLaunchPending(true)
    try {
      const signingKeystorePath = hasText(selectedKeystorePath) ? String(selectedKeystorePath).trim() : ""
      const payload = buildTaskPayload(configPath, flags, signingKeystorePath)
      const data = await startTask(payload)
      if (data?.task) {
        setSelectedTaskId(data.task.id)
        setLiveTaskId(data.task.id)
        setLiveTask(data.task)
      }
      setMessage(t("msg.taskStarted"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    } finally {
      setIsBusy(false)
      setBuildLaunchPending(false)
    }
  }

  async function onStopBuildTask() {
    if (!liveTaskId) return
    try {
      setLiveTask((prev) => (prev ? { ...prev, status: "stopping", stopRequested: true } : prev))
      const data = await stopTask(liveTaskId)
      if (data && data.task) {
        setLiveTask(data.task)
      }
      setMessage(t("msg.stopRequested"))
      await refreshTasks()
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }

  async function onBuildPrimaryAction() {
    if (isBuildRunning || isBuildStopping || buildLaunchPending) {
      await onStopBuildTask()
      return
    }
    await runBuildTask({
      dryRun: false,
      force: false,
    })
  }

  const onOpenGeneratedApkDir = useCallback(async (item) => {
    const taskId = String(item?.taskId || "").trim()
    const relativePath = String(item?.relativePath || "").trim()
    if (!taskId || !relativePath) return
    try {
      const data = await openTaskArtifactDir(taskId, relativePath)
      setMessage(t("msg.opened", { path: data.path || relativePath }))
    } catch (error) {
      setMessage(error.message || String(error))
    }
  }, [openTaskArtifactDir, setMessage, t])

  const completedBuildTaskSignature = useMemo(() => {
    return tasks
      .filter((task) => String(task?.status || "").toLowerCase() === "completed")
      .slice(0, 12)
      .map((task) => String(task?.id || ""))
      .join("|")
  }, [tasks])

  const completedBuildTaskIds = useMemo(
    () => String(completedBuildTaskSignature || "")
      .split("|")
      .map((id) => String(id || "").trim())
      .filter(Boolean),
    [completedBuildTaskSignature],
  )

  useEffect(() => {
    if (activeNav !== navBuildKey) return

    if (completedBuildTaskIds.length === 0) {
      if (buildGeneratedApksSigRef.current !== "") {
        buildGeneratedApksSigRef.current = ""
        setBuildGeneratedApks([])
      }
      setBuildGeneratedApksLoading(false)
      return
    }

    let canceled = false
    if (buildGeneratedApksSigRef.current === "") {
      setBuildGeneratedApksLoading(true)
    }

    Promise.allSettled(
      completedBuildTaskIds.map(async (taskId) => {
        const data = await fetchTaskArtifacts(taskId)
        const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : []
        return artifacts.map((item) => ({
          taskId,
          fileName: String(item?.fileName || ""),
          fullPath: String(item?.fullPath || ""),
          relativePath: String(item?.relativePath || ""),
          sizeBytes: Number(item?.sizeBytes || 0),
          modifiedAt: String(item?.modifiedAt || ""),
        }))
      }),
    )
      .then((results) => {
        if (canceled) return
        const dedup = new Map()
        for (const result of results) {
          if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue
          for (const item of result.value) {
            const key = String(item?.fullPath || "").trim() || `${item.taskId}:${item.relativePath}:${item.fileName}`
            if (!key) continue
            if (!dedup.has(key)) dedup.set(key, item)
          }
        }
        const merged = Array.from(dedup.values())
        merged.sort((a, b) => {
          const aTime = Date.parse(String(a?.modifiedAt || ""))
          const bTime = Date.parse(String(b?.modifiedAt || ""))
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime
          return String(a?.fileName || "").localeCompare(String(b?.fileName || ""), undefined, { sensitivity: "base" })
        })
        const nextSig = merged
          .map((item) => `${String(item?.fullPath || "")}|${Number(item?.sizeBytes || 0)}|${String(item?.modifiedAt || "")}`)
          .join("\n")
        if (nextSig !== buildGeneratedApksSigRef.current) {
          buildGeneratedApksSigRef.current = nextSig
          setBuildGeneratedApks(merged)
        }
      })
      .finally(() => {
        if (!canceled) setBuildGeneratedApksLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [activeNav, navBuildKey, completedBuildTaskIds, fetchTaskArtifacts])

  useEffect(() => {
    const status = String(liveTask?.status || "").toLowerCase()
    if (!status) return
    if (["running", "stopping"].includes(status)) return
    setBuildLaunchPending(false)
  }, [liveTask?.status, setBuildLaunchPending])

  return {
    buildGeneratedApks,
    buildGeneratedApksLoading,
    liveTaskStatus,
    isBuildRunning,
    isBuildStopping,
    liveLastLine,
    buildProgressStages,
    runBuildTask,
    onBuildPrimaryAction,
    onStopBuildTask,
    onOpenGeneratedApkDir,
  }
}
