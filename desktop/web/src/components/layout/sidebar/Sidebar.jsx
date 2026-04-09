import SidebarFooter from "./SidebarFooter"
import SidebarHeader from "./SidebarHeader"
import SidebarNav from "./SidebarNav"

export default function Sidebar({ controller }) {
  const c = controller
  return (
    <aside className='left-panel flex flex-col gap-4'>
      <SidebarHeader t={c.t} />
      <SidebarNav items={c.navItems} activeKey={c.activeNav} onSelect={c.setActiveNav} />
      <SidebarFooter t={c.t} javaEnv={c.javaEnv} hasText={c.hasText} locale={c.locale} setLocale={c.setLocale} theme={c.theme} setTheme={c.setTheme} message={c.message} />
    </aside>
  )
}
