import { cn } from "../../../lib/utils"

export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <nav className='space-y-2'>
      {items.map((item) => {
        const Icon = item.icon
        const active = activeKey === item.key
        return (
          <button key={item.key} type='button' className={cn("sidebar-btn", active ? "sidebar-btn-active" : "sidebar-btn-idle")} onClick={() => onSelect(item.key)}>
            <Icon className='h-5 w-5' />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
