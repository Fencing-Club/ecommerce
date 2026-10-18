import { ApiProvider } from "@reduxjs/toolkit/query/react"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import { ToastProvider } from "./toast-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ApiProvider api={api}>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </ApiProvider>
    </ThemeProvider>
  )
}
