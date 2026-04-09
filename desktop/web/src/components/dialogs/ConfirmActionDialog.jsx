import { Loader2, Trash2 } from "lucide-react"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"

export default function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  t,
  busy,
  onCancel,
  onConfirm,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>{title || t("confirm.title")}</DialogTitle>
          <DialogDescription>{description || t("confirm.desc")}</DialogDescription>
        </DialogHeader>
        <div className='flex justify-end gap-2'>
          <Button variant='ghost' onClick={onCancel} disabled={busy}>
            {t("action.cancel")}
          </Button>
          <Button variant='destructive' onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className='h-4 w-4 animate-spin' /> : <Trash2 className='h-4 w-4' />}
            {t("action.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
