import { Toast } from "@base-ui/react/toast"
import { CircleAlert, CircleCheck } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

export function ToastItem({ toast }: { toast: Toast.Root.ToastObject }) {
  return (
    <Toast.Root
      toast={toast}
      className="flex items-center gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-menu data-[ending]:hidden data-[limited]:hidden"
    >
      {toast.type === "error" ? (
        <CircleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
      ) : (
        <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
      )}
      <Toast.Content className="min-w-0 flex-1">
        <Toast.Title className="text-sm font-normal" />
        <Toast.Description className="mt-1 text-sm text-muted-foreground" />
      </Toast.Content>
      {toast.actionProps && <Toast.Action render={<Button variant="outline" size="sm" />} />}
    </Toast.Root>
  )
}

function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed end-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  )
}
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={3}>
      {children}
      <Toasts />
    </Toast.Provider>
  )
}
