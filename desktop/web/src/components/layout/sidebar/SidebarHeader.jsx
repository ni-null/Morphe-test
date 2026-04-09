export default function SidebarHeader({ t }) {
  return (
    <div>
      <h1 className='text-lg font-semibold'>Morphe Console</h1>
      <p className='text-sm text-muted-foreground'>{t("sidebar.subtitle")}</p>
    </div>
  )
}
