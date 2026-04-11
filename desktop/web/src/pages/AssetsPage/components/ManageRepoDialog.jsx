import { Loader2, Trash2 } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"

export default function ManageRepoDialog({
  t,
  addRepoOpen,
  setAddRepoDialogType,
  manageRepoOptions,
  defaultRepo,
  onDeleteManagedRepo,
  addRepoDraft,
  addRepoBusy,
  addRepoDialogType,
  setPatchesSourceRepoDraft,
  setEngineSourceRepoDraft,
  onConfirmAddRepo,
  hasText,
}) {
  return (
    <Dialog open={addRepoOpen} onOpenChange={(open) => (!open ? setAddRepoDialogType("") : null)}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t("source.manageRepo")}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label>{t("source.customRepos")}</Label>
            <div className='assets-scroll max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-100/85 p-2 pr-1 dark:bg-slate-800/70'>
              {manageRepoOptions.map((repo) => {
                const isDefault = String(repo || "").trim().toLowerCase() === String(defaultRepo || "").trim().toLowerCase()
                return (
                  <div key={`assets-manage-repo-${repo}`} className='flex min-h-8 items-center justify-between gap-2 rounded-lg px-2.5 py-1'>
                    <span className='min-w-0 truncate text-sm'>{repo}</span>
                    {isDefault ? null : (
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-6 w-6 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
                        onClick={() => onDeleteManagedRepo(repo)}
                        aria-label={t("source.deleteCustomRepo")}
                        title={t("source.deleteCustomRepo")}>
                        <Trash2 className='h-3.5 w-3.5' />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='assets-add-repo-input'>{t("source.addCustomRepo")}</Label>
            <div className='flex items-center gap-2'>
              <Input
                id='assets-add-repo-input'
                className='flex-1'
                placeholder={t("source.customRepoPlaceholder")}
                value={addRepoDraft}
                disabled={addRepoBusy}
                onChange={(event) => {
                  if (addRepoDialogType === "patches") {
                    setPatchesSourceRepoDraft(event.target.value)
                  } else {
                    setEngineSourceRepoDraft(event.target.value)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  onConfirmAddRepo()
                }}
              />
              <Button onClick={onConfirmAddRepo} disabled={!hasText(addRepoDraft) || addRepoBusy} className='shrink-0'>
                {addRepoBusy ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
                {t("action.add")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
