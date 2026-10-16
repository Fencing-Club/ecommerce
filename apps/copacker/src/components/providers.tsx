import { ApiProvider } from "@reduxjs/toolkit/query/react"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api } from "@/lib/api"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ApiProvider api={api}>
        <TooltipProvider>{children}</TooltipProvider>
      </ApiProvider>
    </ThemeProvider>
  )
}
