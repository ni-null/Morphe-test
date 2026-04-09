import { Button } from "../../../components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog"
import { Input } from "../../../components/ui/input"
import { Label } from "../../../components/ui/label"

export default function AddCustomAppDialog({
  open,
  onOpenChange,
  t,
  customAppNameDraft,
  setCustomAppNameDraft,
  customAppPackageDraft,
  setCustomAppPackageDraft,
  onConfirm,
  hasText,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{t("dialog.addAppTitle")}</DialogTitle>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='build-custom-app-name'>{t("dialog.addAppNameLabel")}</Label>
            <Input
              id='build-custom-app-name'
              value={customAppNameDraft}
              onChange={(event) => setCustomAppNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                onConfirm()
              }}
              placeholder={t("dialog.addAppNamePlaceholder")}
              autoFocus
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='build-custom-app-package'>{t("dialog.addAppPackageLabel")}</Label>
            <Input
              id='build-custom-app-package'
              value={customAppPackageDraft}
              onChange={(event) => setCustomAppPackageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                onConfirm()
              }}
              placeholder={t("dialog.addAppPackagePlaceholder")}
            />
          </div>
          <div className='flex items-center justify-end gap-2'>
            <Button variant='ghost' onClick={() => onOpenChange(false)}>
              {t("action.cancel")}
            </Button>
            <Button onClick={onConfirm} disabled={!hasText(customAppNameDraft) || !hasText(customAppPackageDraft)}>
              {t("action.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
