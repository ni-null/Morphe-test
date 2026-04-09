import { useMemo, useState } from "react"
import { Card, CardContent } from "../../components/ui/card"
import { Textarea } from "../../components/ui/textarea"
import BuildTopBar from "./components/BuildTopBar"
import BuildSourceSection, { renderSourceOption, resolveSourceLabels } from "./components/BuildSourceSection"
import BuildTargetsSection from "./components/BuildTargetsSection"
import BuildRunSection from "./components/BuildRunSection"
import GeneratedApksSection from "./components/GeneratedApksSection"
import AddCustomAppDialog from "./components/AddCustomAppDialog"
import { formatApkModifiedAt, formatBuildPreviewMessage } from "./utils/buildPageUtils"

export default function BuildPage({
  t,
  isBuildRunning,
  buildLaunchPending,
  isBuildStopping,
  liveLastLine,
  liveTaskStartedAt,
  buildProgressStages,
  onOpenLogDialog,
  liveTaskId,
  onStopBuildTask,
  onBuildPrimaryAction,
  rawOverrideMode,
  onToggleRawMode,
  isBusy,
  setConfigPathDialogOpen,
  rawConfigInput,
  setRawConfigInputValue,
  morpheCliSelectValue,
  morpheCliSelectOptions,
  onChangeMorpheCliSelect,
  patchesSelectValue,
  patchesSelectOptions,
  onChangePatchesSelect,
  keystoreSelectValue,
  keystoreSelectOptions,
  onChangeKeystoreSelect,
  appendApp,
  onAppendCustomApp,
  apps,
  updateApp,
  getPackageIcon,
  hasText,
  onOpenAppSettingsDialog,
  buildGeneratedApks,
  buildGeneratedApksLoading,
  formatBytes,
  onOpenGeneratedApkDir,
}) {
  const [customAppDialogOpen, setCustomAppDialogOpen] = useState(false)
  const [customAppNameDraft, setCustomAppNameDraft] = useState("")
  const [customAppPackageDraft, setCustomAppPackageDraft] = useState("")

  function onCloseCustomAppDialog() {
    setCustomAppDialogOpen(false)
    setCustomAppNameDraft("")
    setCustomAppPackageDraft("")
  }

  function onConfirmAppendCustomApp() {
    const name = String(customAppNameDraft || "").trim()
    const packageName = String(customAppPackageDraft || "").trim()
    if (!name || !packageName) return
    const added = typeof onAppendCustomApp === "function" ? onAppendCustomApp(name, packageName) : false
    if (added !== false) {
      onCloseCustomAppDialog()
    }
  }

  const buildPreviewLine = useMemo(() => {
    const message = formatBuildPreviewMessage(liveLastLine)
    return message || t("build.waiting")
  }, [liveLastLine, t])

  const selectedMorpheItem = useMemo(
    () => (Array.isArray(morpheCliSelectOptions) ? morpheCliSelectOptions : []).find((item) => item?.value === morpheCliSelectValue) || null,
    [morpheCliSelectOptions, morpheCliSelectValue],
  )
  const selectedPatchesItem = useMemo(
    () => (Array.isArray(patchesSelectOptions) ? patchesSelectOptions : []).find((item) => item?.value === patchesSelectValue) || null,
    [patchesSelectOptions, patchesSelectValue],
  )
  const selectedKeystoreItem = useMemo(
    () => (Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).find((item) => item?.value === keystoreSelectValue) || null,
    [keystoreSelectOptions, keystoreSelectValue],
  )
  const isBuildUiLocked = isBusy || isBuildRunning || buildLaunchPending || isBuildStopping

  return (
    <>
      <BuildTopBar
        t={t}
        rawOverrideMode={rawOverrideMode}
        onToggleRawMode={onToggleRawMode}
        controlsLocked={isBuildUiLocked}
        setConfigPathDialogOpen={setConfigPathDialogOpen}
        appendApp={appendApp}
      />

      <Card className='rounded-xl bg-white dark:bg-card text-card-foreground border border-slate-200 dark:border-slate-700 shadow-sm'>
        <CardContent className='space-y-6 py-5'>
          {rawOverrideMode ? (
            <div className='space-y-2'>
              <Textarea
                id='raw-toml'
                className='min-h-[340px] font-mono text-xs'
                value={rawConfigInput}
                onChange={(event) => setRawConfigInputValue(event.target.value)}
                spellCheck={false}
                disabled={isBuildUiLocked}
              />
            </div>
          ) : (
            <div className='space-y-6'>
              <BuildSourceSection
                t={t}
                morpheCliSelectValue={morpheCliSelectValue}
                onChangeMorpheCliSelect={onChangeMorpheCliSelect}
                selectedMorpheItem={selectedMorpheItem}
                resolveSourceLabels={resolveSourceLabels}
                morpheCliSelectOptions={morpheCliSelectOptions}
                renderSourceOption={renderSourceOption}
                patchesSelectValue={patchesSelectValue}
                onChangePatchesSelect={onChangePatchesSelect}
                selectedPatchesItem={selectedPatchesItem}
                patchesSelectOptions={patchesSelectOptions}
                keystoreSelectValue={keystoreSelectValue}
                onChangeKeystoreSelect={onChangeKeystoreSelect}
                selectedKeystoreItem={selectedKeystoreItem}
                keystoreSelectOptions={keystoreSelectOptions}
                controlsLocked={isBuildUiLocked}
              />

              <BuildTargetsSection
                t={t}
                apps={apps}
                updateApp={updateApp}
                hasText={hasText}
                getPackageIcon={getPackageIcon}
                onOpenAppSettingsDialog={onOpenAppSettingsDialog}
                isBusy={isBusy}
                onAddCustom={() => setCustomAppDialogOpen(true)}
                controlsLocked={isBuildUiLocked}
              />
            </div>
          )}

          <BuildRunSection
            t={t}
            isBuildRunning={isBuildRunning}
            buildLaunchPending={buildLaunchPending}
            isBuildStopping={isBuildStopping}
            buildProgressStages={buildProgressStages}
            buildPreviewLine={buildPreviewLine}
            liveTaskStartedAt={liveTaskStartedAt}
            onOpenLogDialog={onOpenLogDialog}
            liveTaskId={liveTaskId}
            onStopBuildTask={onStopBuildTask}
            onBuildPrimaryAction={onBuildPrimaryAction}
          />
        </CardContent>
      </Card>

      <GeneratedApksSection
        t={t}
        hasText={hasText}
        getPackageIcon={getPackageIcon}
        buildGeneratedApksLoading={buildGeneratedApksLoading}
        buildGeneratedApks={buildGeneratedApks}
        formatBytes={formatBytes}
        formatApkModifiedAt={formatApkModifiedAt}
        onOpenGeneratedApkDir={onOpenGeneratedApkDir}
      />

      <AddCustomAppDialog
        open={customAppDialogOpen}
        onOpenChange={(open) => (!open ? onCloseCustomAppDialog() : setCustomAppDialogOpen(true))}
        t={t}
        customAppNameDraft={customAppNameDraft}
        setCustomAppNameDraft={setCustomAppNameDraft}
        customAppPackageDraft={customAppPackageDraft}
        setCustomAppPackageDraft={setCustomAppPackageDraft}
        onConfirm={onConfirmAppendCustomApp}
        hasText={hasText}
      />
    </>
  )
}
