import { FileText } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"

export default function ConfigPathDialog({ open, onOpenChange, t, configPath, setConfigPath }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <FileText className='h-4 w-4' />
            {t("dialog.configPathTitle")}
          </DialogTitle>
          <DialogDescription>{t("dialog.configPathDesc")}</DialogDescription>
        </DialogHeader>
        <div className='space-y-1'>
          <Label htmlFor='config-path'>{t("dialog.configPathLabel")}</Label>
          <Input id='config-path' value={configPath} onChange={(event) => setConfigPath(event.target.value)} placeholder='toml/default.toml' />
        </div>
      </DialogContent>
    </Dialog>
  )
}
