import { useState } from "react"
import { useAction } from "@/hooks/use-action"
import { announceWorkspace } from "@/hooks/use-workspace-watch"

// Opens another workspace: saves the choice, tells this browser's other tabs, and loads a fresh document, since the
// portal's layout and caches belong to the workspace it leaves. `switching` is the workspace on its way, and a failure's
// message is in `error`, or goes to `onError` for one shown somewhere else.
export function useSwitchWorkspace({ onError }: { onError?: (message: string) => void } = {}) {
  const [target, setTarget] = useState<string | null>(null)
  const { run, pending, error } = useAction("workspace.switch", { navigation: "document", onError })
  async function switchTo(id: string) {
    setTarget(id)
    if (await run({ id })) {
      announceWorkspace(id)
    }
  }
  return { switchTo, switching: pending ? target : null, error }
}
