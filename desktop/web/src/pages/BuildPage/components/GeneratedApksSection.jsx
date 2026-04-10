import { memo, useEffect, useMemo, useState } from "react"
import { ChevronDown, FolderOpen, Package } from "lucide-react"
import { Card, CardContent } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../../../components/ui/popover"
import { inferApkPackageGroup } from "../utils/buildPageUtils"

function GeneratedApksSection({
  t,
  hasText,
  getPackageIcon,
  buildGeneratedApksLoading,
  buildGeneratedApks,
  formatBytes,
  formatApkModifiedAt,
  onOpenGeneratedApkDir,
}) {
  const [selectedAppFilter, setSelectedAppFilter] = useState("__ALL__")
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)

  const apkRows = useMemo(() => {
    const list = Array.isArray(buildGeneratedApks) ? buildGeneratedApks : []
    return list.map((item) => {
      const appKey = inferApkPackageGroup(item)
      const mapped = String(getPackageIcon(appKey) || "").trim()
      const normalized = String(appKey || "")
        .trim()
        .toLowerCase()
      const fallback = /^[a-z0-9_-]+$/u.test(normalized) ? `./assets/apps/${normalized.replace(/_/g, "-")}.svg` : ""
      return {
        ...item,
        appKey,
        appIcon: hasText(mapped) ? mapped : fallback,
      }
    })
  }, [buildGeneratedApks, getPackageIcon, hasText])

  const appFilterOptions = useMemo(() => {
    const buckets = new Map()
    for (const row of apkRows) {
      const key = String(row?.appKey || "").trim() || "unknown"
      const existing = buckets.get(key)
      if (existing) {
        existing.count += 1
      } else {
        buckets.set(key, { key, count: 1, icon: String(row?.appIcon || "").trim() })
      }
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: "base" }))
    return [{ key: "__ALL__", count: apkRows.length, icon: "" }, ...sorted]
  }, [apkRows])

  useEffect(() => {
    if (selectedAppFilter === "__ALL__") return
    const exists = appFilterOptions.some((item) => item.key === selectedAppFilter)
    if (!exists) {
      setSelectedAppFilter("__ALL__")
    }
  }, [selectedAppFilter, appFilterOptions])

  const filteredRows = useMemo(() => {
    if (selectedAppFilter === "__ALL__") return apkRows
    return apkRows.filter((row) => row.appKey === selectedAppFilter)
  }, [apkRows, selectedAppFilter])

  const selectedFilterOption = useMemo(
    () => appFilterOptions.find((item) => item.key === selectedAppFilter) || appFilterOptions[0] || null,
    [appFilterOptions, selectedAppFilter],
  )
  const resolveAppLabel = (value) => (value === "unknown" ? t("build.generated.unknownApp") : value)

  return (
    <>
      <div className='mb-3 mt-4 flex items-center gap-2 text-lg font-semibold'>
        <Package className='h-5 w-5' />
        {t("build.generated.title")}
      </div>
      <Card className='overflow-hidden rounded-xl border-0 bg-white text-card-foreground shadow-none dark:bg-card'>
        <CardContent className='p-0'>
          {buildGeneratedApksLoading ? (
            <p className='p-3 text-sm text-muted-foreground'>{t("build.generated.loading")}</p>
          ) : apkRows.length === 0 ? (
            <p className='p-3 text-sm text-muted-foreground'>{t("build.generated.empty")}</p>
          ) : (
            <div className='table-scroll max-h-[380px] overflow-auto'>
              <table className='w-full min-w-[720px] text-sm'>
                <thead className='sticky top-0 z-10 bg-slate-100 text-slate-700 dark:bg-slate-800/90 dark:text-slate-200'>
                  <tr>
                    <th className='px-3 py-1.5 text-left font-medium'>
                      <div className='inline-flex items-center gap-2'>
                        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='h-6 gap-1.5 px-1.5 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800'
                              aria-label={t("build.generated.filterApp")}>
                              {selectedFilterOption?.key === "__ALL__" ? (
                                <Package className='h-3.5 w-3.5 text-muted-foreground' />
                              ) : hasText(selectedFilterOption?.icon) ? (
                                <img
                                  src={selectedFilterOption.icon}
                                  alt={selectedFilterOption.key}
                                  className='h-3.5 w-3.5 rounded-sm object-contain grayscale opacity-80 saturate-0 dark:invert dark:brightness-200'
                                />
                              ) : (
                                <Package className='h-3.5 w-3.5 text-muted-foreground' />
                              )}
                              <span>
                                {selectedFilterOption?.key === "__ALL__"
                                  ? t("build.generated.filterAll")
                                  : t("build.generated.filterSelected", { value: resolveAppLabel(selectedFilterOption?.key || "unknown") })}
                              </span>
                              <ChevronDown className='h-3.5 w-3.5 opacity-70' />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align='start' className='w-64 p-2'>
                            <div className='table-scroll max-h-64 overflow-auto pr-1'>
                              <div className='space-y-1'>
                                {appFilterOptions.map((item) => {
                                  const active = item.key === selectedAppFilter
                                  return (
                                    <button
                                      key={`apk-filter-${item.key}`}
                                      type='button'
                                      onClick={() => {
                                        setSelectedAppFilter(item.key)
                                        setFilterPopoverOpen(false)
                                      }}
                                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                        active
                                          ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                                          : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/70"
                                      }`}>
                                      {item.key === "__ALL__" ? (
                                        <Package className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                                      ) : hasText(item.icon) ? (
                                        <img
                                          src={item.icon}
                                          alt={item.key}
                                          className='h-3.5 w-3.5 shrink-0 rounded-sm object-contain grayscale opacity-80 saturate-0 dark:invert dark:brightness-200'
                                        />
                                      ) : (
                                        <Package className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                                      )}
                                      <span className='min-w-0 flex-1 truncate'>{item.key === "__ALL__" ? t("build.generated.all") : resolveAppLabel(item.key)}</span>
                                      <span className='shrink-0 text-[11px] text-muted-foreground'>{item.count}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <span>{t("build.generated.col.file")}</span>
                      </div>
                    </th>
                    <th className='px-3 py-1.5 text-right font-medium'>{t("build.generated.col.size")}</th>
                    <th className='px-3 py-1.5 text-right font-medium'>{t("build.generated.col.time")}</th>
                    <th className='px-3 py-1.5 text-right font-medium'>{t("build.generated.col.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr key={`${item.taskId}:${item.relativePath}:${item.fileName}`} className='hover:bg-muted/30'>
                      <td className='px-3 py-1.5'>
                        <span className='inline-flex min-w-0 max-w-[560px] items-center gap-2'>
                          {hasText(item.appIcon) ? (
                            <img
                              src={item.appIcon}
                              alt={item.appKey}
                              className='h-4 w-4 rounded-sm object-contain grayscale opacity-70 saturate-0 dark:invert dark:brightness-200 dark:opacity-90'
                            />
                          ) : (
                            <Package className='h-4 w-4 text-muted-foreground' />
                          )}
                          <span className='min-w-0 truncate' title={`${resolveAppLabel(item.appKey)} / ${item.fileName}`}>
                            <span className='sr-only'>{resolveAppLabel(item.appKey)} </span>
                            {item.fileName}
                          </span>
                        </span>
                      </td>
                      <td className='px-3 py-1.5 text-right text-muted-foreground'>{formatBytes(item.sizeBytes)}</td>
                      <td className='px-3 py-1.5 text-right text-muted-foreground'>{formatApkModifiedAt(item.modifiedAt)}</td>
                      <td className='px-3 py-1.5 text-right'>
                        <Button
                          type='button'
                          variant='ghost'
                          size='sm'
                          className='h-7 px-2 text-xs'
                          onClick={() => {
                            if (typeof onOpenGeneratedApkDir === "function") {
                              onOpenGeneratedApkDir(item)
                            }
                          }}
                          title={t("build.generated.openDirTitle")}
                          aria-label={t("build.generated.openDirTitle")}>
                          <FolderOpen className='h-4 w-4' />
                          {t("build.generated.openDir")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function areEqual(prevProps, nextProps) {
  return (
    prevProps.t === nextProps.t &&
    prevProps.hasText === nextProps.hasText &&
    prevProps.getPackageIcon === nextProps.getPackageIcon &&
    prevProps.buildGeneratedApksLoading === nextProps.buildGeneratedApksLoading &&
    prevProps.buildGeneratedApks === nextProps.buildGeneratedApks &&
    prevProps.formatBytes === nextProps.formatBytes &&
    prevProps.formatApkModifiedAt === nextProps.formatApkModifiedAt &&
    prevProps.onOpenGeneratedApkDir === nextProps.onOpenGeneratedApkDir
  )
}

export default memo(GeneratedApksSection, areEqual)
