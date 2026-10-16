import type { LocationRewrite } from "@tanstack/react-router"

// Each router owns its rewrite state. Keep the browser's complete address while matching only the maintenance route;
// the reverse mapping prevents canonical redirects and keeps server/client hydration on the same history entry.
export function maintenanceRewrite(active: boolean) {
  let requested: URL | undefined
  return {
    input: ({ url }) => {
      if (active) {
        if (url.pathname !== "/maintenance") {
          requested = new URL(url)
        }
        url.pathname = "/maintenance"
        url.search = ""
      }
      return url
    },
    output: ({ url }) => (active && requested && url.pathname === "/maintenance" ? new URL(requested) : url)
  } satisfies LocationRewrite
}
