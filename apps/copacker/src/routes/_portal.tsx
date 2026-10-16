import { createFileRoute, Outlet } from "@tanstack/react-router"
import PortalNotFound from "@/app/(portal)/not-found"
import { Portal } from "@/app/(portal)/portal"
import { AccessProvider } from "@/components/access"
import { AppProviders } from "@/components/app-providers"
import { readPortal } from "@/portal.functions"

export const Route = createFileRoute("/_portal")({
  loader: ({ location }) => readPortal({ data: location.href }),
  shouldReload: true,
  component: PortalLayout,
  notFoundComponent: PortalNotFound
})

function PortalLayout() {
  const { permissions, ...shell } = Route.useLoaderData()
  return (
    <AppProviders>
      <AccessProvider permissions={permissions}>
        <Portal {...shell}>
          <Outlet />
        </Portal>
      </AccessProvider>
    </AppProviders>
  )
}
