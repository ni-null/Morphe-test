import { Boxes, Cloud, FlaskConical, HardDrive, KeyRound, SquareChevronRight } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../../components/ui/select"

export default function BuildSourceSection({
  t,
  morpheCliSelectValue,
  onChangeMorpheCliSelect,
  selectedMorpheItem,
  resolveSourceLabels,
  morpheCliSelectOptions,
  renderSourceOption,
  patchesSelectValue,
  onChangePatchesSelect,
  selectedPatchesItem,
  patchesSelectOptions,
  keystoreSelectValue,
  onChangeKeystoreSelect,
  selectedKeystoreItem,
  keystoreSelectOptions,
  controlsLocked,
}) {
  return (
    <section className='space-y-3'>
      <div className='space-y-2'>
        <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
          <p className='text-sm text-slate-700 dark:text-slate-300'>CLI 版本</p>
          <p className='text-sm text-slate-700 dark:text-slate-300'>Patches 檔案</p>
          <p className='text-sm text-slate-700 dark:text-slate-300'>keystore</p>
        </div>

        <div className='grid grid-cols-1 items-center gap-3 md:grid-cols-3'>
          <Select value={morpheCliSelectValue} onValueChange={onChangeMorpheCliSelect} disabled={controlsLocked}>
            <SelectTrigger className='h-11 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
              <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                <SquareChevronRight className='h-3.5 w-3.5' />
              </span>
              <span className='pointer-events-none flex min-w-0 flex-1 flex-col items-start px-3 text-left leading-tight'>
                <span className='block min-w-0 truncate text-sm font-semibold'>{resolveSourceLabels(selectedMorpheItem).primary}</span>
                <span className='block min-w-0 truncate text-xs text-muted-foreground'>{resolveSourceLabels(selectedMorpheItem).secondary}</span>
              </span>
            </SelectTrigger>
            <SelectContent position='popper' side='bottom' align='start'>
              {(Array.isArray(morpheCliSelectOptions) ? morpheCliSelectOptions : []).map((item) => (
                <SelectItem key={`morphe-cli-select-${item.value}`} value={item.value}>
                  {renderSourceOption(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={patchesSelectValue} onValueChange={onChangePatchesSelect} disabled={controlsLocked}>
            <SelectTrigger className='h-12 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
              <span className='inline-flex items-center gap-2 whitespace-nowrap pr-2 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300'>
                <Boxes className='h-3.5 w-3.5' />
              </span>
              <span className='pointer-events-none flex min-w-0 flex-1 flex-col items-start px-3 text-left leading-tight'>
                <span className='block min-w-0 truncate text-sm font-semibold'>{resolveSourceLabels(selectedPatchesItem).primary}</span>
                <span className='block min-w-0 truncate text-xs text-muted-foreground'>{resolveSourceLabels(selectedPatchesItem).secondary}</span>
              </span>
            </SelectTrigger>
            <SelectContent
              position='popper'
              side='bottom'
              align='start'
              className='max-h-[28rem]'
              viewportClassName='h-auto max-h-[26rem]'>
              {(Array.isArray(patchesSelectOptions) ? patchesSelectOptions : []).map((item) => (
                <SelectItem key={`patches-select-${item.value}`} value={item.value}>
                  {renderSourceOption(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={keystoreSelectValue} onValueChange={onChangeKeystoreSelect} disabled={controlsLocked}>
            <SelectTrigger className='h-11 w-full border-0 bg-slate-100 px-3 shadow-sm hover:bg-slate-100 dark:bg-slate-800 dark:shadow-black/30 dark:hover:bg-slate-800'>
              <span className='inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300'>
                <KeyRound className='h-3.5 w-3.5' />
              </span>
              <span className='pointer-events-none min-w-0 flex-1 truncate px-3 text-left text-xs text-muted-foreground'>
                {String(selectedKeystoreItem?.label || "").trim() || t("settings.noKeystore")}
              </span>
            </SelectTrigger>
            <SelectContent position='popper' side='bottom' align='start'>
              {(Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).length === 0 ? (
                <SelectItem value='__NONE__' disabled>
                  {t("settings.noKeystore")}
                </SelectItem>
              ) : (
                (Array.isArray(keystoreSelectOptions) ? keystoreSelectOptions : []).map((item) => (
                  <SelectItem key={`keystore-select-${item.value}`} value={item.value}>
                    <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
                      <HardDrive className='h-3.5 w-3.5 text-slate-600 dark:text-slate-400' />
                      <span className='min-w-0 truncate'>{item.label}</span>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}

export function renderSourceOption(item) {
  const kind = String(item?.kind || "").trim().toLowerCase()
  const label = String(item?.label || "").trim()
  const folderLabel = String(item?.folderLabel || "").trim()
  const remoteRepoMatch = !folderLabel ? label.match(/^(.*?)(\s*\(([^()]+)\))\s*$/u) : null
  const mainLabel = remoteRepoMatch ? String(remoteRepoMatch[1] || "").trim() : label
  const rightLabel = folderLabel || (remoteRepoMatch ? String(remoteRepoMatch[3] || "").trim() : "")
  const Icon = kind === "remote-dev" ? FlaskConical : kind === "local-file" ? HardDrive : Cloud
  const iconClassName =
    kind === "remote-dev"
      ? "h-3.5 w-3.5 text-amber-600"
      : kind === "local-file"
        ? "h-3.5 w-3.5 text-slate-600 dark:text-slate-400"
        : "h-3.5 w-3.5 text-sky-600"

  return (
    <span className='inline-flex min-w-0 flex-1 items-center gap-2'>
      <Icon className={iconClassName} />
      <span className='min-w-0'>
        <span className='block truncate'>{mainLabel}</span>
        {rightLabel ? <span className='block truncate text-xs text-muted-foreground'>{rightLabel}</span> : null}
      </span>
    </span>
  )
}

export function resolveSourceLabels(item) {
  const label = String(item?.label || "").trim()
  const folderLabel = String(item?.folderLabel || "").trim()
  const remoteRepoMatch = !folderLabel ? label.match(/^(.*?)(\s*\(([^()]+)\))\s*$/u) : null
  const primary = remoteRepoMatch ? String(remoteRepoMatch[1] || "").trim() : label
  const secondary = folderLabel || (remoteRepoMatch ? String(remoteRepoMatch[3] || "").trim() : "")
  return { primary, secondary }
}
