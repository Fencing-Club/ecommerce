import { createRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { maintenanceRewrite } from "@/lib/maintenance"
import { parseUrlSearch, stringifyUrlSearch } from "@/lib/url-search"
import { maintenanceActive } from "@/server/maintenance"
import { routeTree } from "./routeTree.gen"

const maintenanceDocument = createIsomorphicFn()
  .server(() => maintenanceActive())
  .client(() => document.documentElement.dataset.maintenance === "true")

export function getRouter() {
  return createRouter({
    routeTree,
    parseSearch: parseUrlSearch,
    stringifySearch: stringifyUrlSearch,
    scrollRestoration: true,
    rewrite: maintenanceRewrite(maintenanceDocument())
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
