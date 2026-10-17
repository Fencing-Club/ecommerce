import { configureStore } from "@reduxjs/toolkit"
import { afterEach, expect, it, vi } from "vitest"
import { api } from "../src/lib/api"

// Node does not expose browser opaque responses. Model that Fetch contract while exercising the real RTK query.
class BrowserRedirect extends Response {
  override get type() {
    return "opaqueredirect" as const
  }
  override get status() {
    return 0
  }
  override clone() {
    return new BrowserRedirect()
  }
}

afterEach(() => vi.unstubAllGlobals())

it("leaves the stale workspace without following or replaying a redirected form request", async () => {
  const navigate = vi.fn<(href: string) => void>()
  const requests: Request[] = []
  // Browsers accept relative request URLs; Node requires an explicit base.
  const NativeRequest = Request
  vi.stubGlobal(
    "Request",
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === "string" ? new URL(input, "https://copacker.example") : input, init)
      }
    }
  )
  vi.stubGlobal("window", { location: { assign: navigate } })
  vi.stubGlobal("fetch", async (request: Request) => {
    requests.push(request)
    return new BrowserRedirect()
  })
  const store = configureStore({
    reducer: { [api.reducerPath]: api.reducer },
    middleware: (getDefault) => getDefault().concat(api.middleware)
  })
  const result = await store.dispatch(
    api.endpoints.action.initiate({ action: "supplier.create", data: { name: "A supplier" } })
  )
  expect(result.error).toBeDefined()
  expect(requests).toHaveLength(1)
  expect(requests[0]?.redirect).toBe("manual")
  expect(requests[0]?.method).toBe("POST")
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/workspaces?unavailable=1")
  store.dispatch(api.util.resetApiState())
})
