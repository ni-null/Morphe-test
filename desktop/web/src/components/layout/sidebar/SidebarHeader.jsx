export default function SidebarHeader({ t }) {
  return (
    <div>
      <h1 className='text-lg font-semibold'>Patcher Console</h1>
      <p className='text-sm text-muted-foreground'>{t("sidebar.subtitle")}</p>
    </div>
  )
}
