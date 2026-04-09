import { Code2, Hammer, Pencil, Plus } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { cn } from "../../../lib/utils"

export default function BuildTopBar({ t, rawOverrideMode, onToggleRawMode, isBusy, setConfigPathDialogOpen, appendApp }) {
  return (
    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
      <div className='flex items-center gap-2 text-lg font-semibold'>
        <Hammer className='h-5 w-5' />
        {t("build.title")}
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='ghost'
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs border-0 bg-transparent hover:bg-transparent",
            rawOverrideMode ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
          onClick={onToggleRawMode}
          disabled={isBusy}
        >
          <Code2 className='h-4 w-4' />
          {t("settings.raw")}
        </Button>
        <Button
          variant='ghost'
          className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-transparent text-muted-foreground hover:bg-transparent'
          onClick={() => setConfigPathDialogOpen(true)}
          disabled={isBusy}
          aria-label={t("dialog.configPathTitle")}
          title={t("dialog.configPathTitle")}
        >
          <Pencil className='h-4 w-4' />
          {t("settings.path")}
        </Button>
        <Button
          variant='ghost'
          className='h-8 gap-1.5 px-2.5 text-xs border-0 bg-transparent text-muted-foreground hover:bg-transparent'
          onClick={appendApp}
          disabled={isBusy}
        >
          <Plus className='h-4 w-4' />
          {t("settings.loadPresets")}
        </Button>
      </div>
    </div>
  )
}
