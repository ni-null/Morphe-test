import { Globe, Moon, Sun } from "lucide-react"
import { Button } from "../../ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"
import { SUPPORTED_LOCALES } from "../../../i18n"

export default function SidebarFooter({ t, javaEnv, hasText, locale, setLocale, theme, setTheme }) {
  return (
    <div className='mt-auto space-y-3'>
      <div className='space-y-2 rounded-md bg-slate-100/80 p-2.5 dark:bg-slate-800/70'>
        <div className='flex items-center justify-between gap-2 text-xs'>
          <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
            <span className={`h-2 w-2 rounded-full ${javaEnv.loading ? "bg-slate-300 dark:bg-slate-500" : javaEnv.installed ? "bg-emerald-400/80" : "bg-red-400/80"}`} />
            {t("sidebar.javaVersion")}
          </span>
          <span className='font-medium'>
            {javaEnv.loading ? t("sidebar.checking") : javaEnv.installed ? (hasText(javaEnv.version) ? javaEnv.version : "OK") : t("sidebar.notInstalled")}
          </span>
        </div>
      </div>
      <div className='space-y-1'>
        <div className='flex items-center gap-2'>
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className='h-9 min-w-0 flex-1'>
              <span className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
                <Globe className='h-3.5 w-3.5' />
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            className='h-9 w-9 shrink-0 border-0 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={locale === "zh-TW" ? "切換深色模式" : "Toggle dark mode"}
            title={locale === "zh-TW" ? "切換深色模式" : "Toggle dark mode"}>
            {theme === "dark" ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
          </Button>
        </div>
      </div>
    </div>
  )
}
