import { createRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { maintenanceRewrite } from "@/lib/maintenance"
import { parseUrlSearch, stringifyUrlSearch } from "@/lib/url-search"
import { maintenanceActive } from "@/server/maintenance"
import { RouteError } from "./routes/-page-route"
import { routeTree } from "./routeTree.gen"

const maintenanceDocument = createIsomorphicFn()
  .server(() => maintenanceActive())
  .client(() => document.documentElement.dataset.maintenance === "true")

export function getRouter() {
  return createRouter({
    routeTree,
    // A page outside the portal, or the portal's shell, fails on its own page. Portal pages and the sign-in pages name
    // the error page that fits inside their layout.
    defaultErrorComponent: RouteError,
    parseSearch: parseUrlSearch,
    stringifySearch: stringifyUrlSearch,
    scrollRestoration: true,
    // Editors initialize local form state from their loader. Never mount them with an earlier visit's stale DTO.
    defaultStaleReloadMode: "blocking",
    defaultPreloadStaleTime: 0,
    rewrite: maintenanceRewrite(maintenanceDocument())
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
