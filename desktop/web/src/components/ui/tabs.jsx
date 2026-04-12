import * as React from "react"
import { cn } from "../../lib/utils"

const TabsContext = React.createContext({
  value: "",
  onValueChange: () => {},
})

function Tabs({ value, defaultValue, onValueChange, className, children }) {
  const [innerValue, setInnerValue] = React.useState(String(defaultValue || ""))
  const isControlled = typeof value === "string"
  const currentValue = isControlled ? String(value || "") : innerValue

  const setValue = React.useCallback(
    (nextValue) => {
      const next = String(nextValue || "")
      if (!isControlled) setInnerValue(next)
      if (typeof onValueChange === "function") onValueChange(next)
    },
    [isControlled, onValueChange],
  )

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }) {
  return <div className={cn("inline-flex h-10 items-center rounded-md bg-muted p-1 text-muted-foreground", className)} {...props} />
}

function TabsTrigger({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext)
  const tabValue = String(value || "")
  const active = context.value === tabValue
  return (
    <button
      type='button'
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      onClick={() => context.onValueChange(tabValue)}
      {...props}>
      {children}
    </button>
  )
}

function TabsContent({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext)
  if (context.value !== String(value || "")) return null
  return (
    <div className={cn("mt-2", className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
