import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useErrorMessage } from "@/hooks/use-error-text"
import { type ActionResult, useActionMutation } from "@/lib/api"
import { finishSignIn } from "@/lib/auth-navigation"

// How a successful action's redirect opens: inside the app, or as a new document, which drops every route and API
// cache from the previous session or workspace.
export type ActionNavigation = "router" | "document"

// A request other than /api/action, such as a connection's own endpoint. Refreshing after it is up to its caller.
export type ActionRequest = (data: Record<string, unknown>) => Promise<ActionResult | void>

// Shows what a successful action changed: opens its redirect, or reloads the open page's data. It resolves once the new
// data shows, so a dialog closes onto it, and returns false when a new document is loading instead.
export function useActionSettle(navigation: ActionNavigation = "router") {
  const router = useRouter()
  return async (result: ActionResult) => {
    if (!result.redirect) {
      await router.invalidate({ sync: true })
      return true
    }
    if (navigation === "document") {
      finishSignIn(result.redirect)
      return false
    }
    // The next page loads its data fresh, so it isn't refreshed again.
    await router.navigate({ href: result.redirect })
    return true
  }
}

type Options = {
  // The message for a failure without one of its own, such as "Couldn’t close PO-1042".
  fallback?: string
  // Runs once the result shows: after its redirect opens or the page's data reloads. A page that's leaving for a new
  // document skips it.
  onSuccess?: (result: ActionResult) => void | Promise<void>
  // Gets a failure's message, for one shown somewhere else, such as a toast.
  onError?: (message: string) => void
  navigation?: ActionNavigation
}

// Runs one mutation: an /api/action by name, or another request. `run` never throws; a failure's message is in `error`
// until the next run or `reset`. Pending lasts until the result shows, or until the next document replaces the page.
export function useAction(action: string | ActionRequest, { fallback, onSuccess, onError, navigation }: Options = {}) {
  const [mutate] = useActionMutation()
  const settle = useActionSettle(navigation)
  const errorMessage = useErrorMessage()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function run(data: Record<string, unknown> = {}) {
    setPending(true)
    setError("")
    try {
      let result: ActionResult
      if (typeof action === "string") {
        result = await mutate({ action, data }).unwrap()
        if (!(await settle(result))) {
          return result
        }
      } else {
        result = (await action(data)) ?? {}
      }
      await onSuccess?.(result)
      setPending(false)
      return result
    } catch (failure) {
      const message = errorMessage(failure, fallback)
      setError(message)
      setPending(false)
      onError?.(message)
      return undefined
    }
  }

  return { run, pending, error, reset: () => setError("") }
}
