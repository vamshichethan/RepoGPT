"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("flex flex-col gap-5 w-full", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "glass flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl border border-white/10 w-full shrink-0",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200 cursor-pointer select-none",
        "text-white/60 hover:text-white/95 hover:bg-white/5",
        "data-active:gradient-bg data-active:text-white data-active:shadow-lg data-active:font-semibold",
        "data-[state=active]:gradient-bg data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:font-semibold",
        "aria-selected:gradient-bg aria-selected:text-white aria-selected:shadow-lg aria-selected:font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("w-full flex-1 outline-none animate-fade-in", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
