import type { LocationRewrite } from "@tanstack/react-router"

// Added by the remaining Next boundary (server/next-maintenance.ts). next.config.ts then shows
// the maintenance page at the page's own address, and the page skips sign-in and the database, which may be down.
export const maintenanceHeader = "x-copacker-maintenance"

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
