import { Toast } from "@base-ui/react/toast"
import { CircleAlert, CircleCheck } from "lucide-react"
import type { ReactNode } from "react"

function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed end-4 bottom-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            toast={toast}
            className="flex items-center gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg data-[ending]:hidden data-[limited]:hidden"
          >
            {toast.type === "error" ? (
              <CircleAlert aria-hidden className="size-4 shrink-0" />
            ) : (
              <CircleCheck aria-hidden className="size-4 shrink-0" />
            )}
            <Toast.Content>
              <Toast.Title className="text-sm font-medium" />
            </Toast.Content>
          </Toast.Root>
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
