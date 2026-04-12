import { useEffect } from "react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import { Button } from "../ui/button"

export default function WindowAlertToast({ t, hasText, message, onClose }) {
  const messageText = typeof message === "string" ? String(message) : String(message?.text || "")
  const messageType = String(message?.type || "success").trim().toLowerCase()
  const isError = messageType === "error"
  const messageKey = typeof message === "object" && message
    ? `${String(message?.at || "")}:${messageType}:${messageText}`
    : `${messageType}:${messageText}`

  useEffect(() => {
    if (!hasText(messageText)) return undefined
    if (typeof onClose !== "function") return undefined
    const timer = window.setTimeout(() => {
      onClose()
    }, 3000)
    return () => {
      window.clearTimeout(timer)
    }
  }, [hasText, messageKey, messageText, onClose])

  if (!hasText(messageText)) return null

  return (
    <div className='pointer-events-none fixed bottom-4 right-4 z-[70] w-[min(92vw,420px)]'>
      <Alert variant={isError ? "destructive" : "success"} className='pointer-events-auto shadow-lg'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <AlertTitle className='flex items-center gap-1.5 text-xs'>
              {isError ? <AlertCircle className='h-3.5 w-3.5' /> : <CheckCircle2 className='h-3.5 w-3.5' />}
              {isError ? t("sidebar.alertFailed") : t("sidebar.alertSuccess")}
            </AlertTitle>
            <AlertDescription className='break-words text-xs'>{messageText}</AlertDescription>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='h-6 w-6 shrink-0'
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}>
            <X className='h-3.5 w-3.5' />
          </Button>
        </div>
      </Alert>
    </div>
  )
}
