import { createRouter, useRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { PortalError } from "@/components/portal-error"
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
    defaultErrorComponent: function PortalRouteError({ reset }) {
      const router = useRouter()
      return (
        <PortalError
          retry={() => {
            void router.invalidate().then(reset)
          }}
        />
      )
    },
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
