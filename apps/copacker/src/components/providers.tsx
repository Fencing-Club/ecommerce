import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { ApiProvider } from "@reduxjs/toolkit/query/react"
import { useEffect } from "react"
import { api } from "@/lib/api"
import { themeStore } from "@/lib/theme"
import { ToastProvider } from "./toast-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  // Keeps the page's theme current: the choice made in the account menu, or the computer's setting until one is made.
  // The root layout's script has applied it before the first paint. Starting is counted, so one layout replacing
  // another keeps it running.
  useEffect(() => themeStore.start(), [])
  return (
    <ApiProvider api={api}>
      <TooltipProvider>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </ApiProvider>
  )
}
