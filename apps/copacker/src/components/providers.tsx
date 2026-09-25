"use client"

import { ApiProvider } from "@reduxjs/toolkit/query/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api } from "@/lib/api"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider api={api}>
      <TooltipProvider>{children}</TooltipProvider>
    </ApiProvider>
  )
}
