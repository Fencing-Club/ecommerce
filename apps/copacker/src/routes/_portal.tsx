import { createFileRoute, Outlet } from "@tanstack/react-router"
import PortalNotFound from "@/app/(portal)/not-found"
import { Portal } from "@/app/(portal)/portal"
import { AccessProvider } from "@/components/access"
import { AppProviders } from "@/components/app-providers"
import { readPortal } from "@/portal.functions"

// The shell loads on entering the portal and when the router is invalidated, such as after an action. Moving between
// portal pages keeps it: every page's loader checks the session again, and WorkspaceWatch checks on every page change
// that the workspace is still the one the shell shows.
export const Route = createFileRoute("/_portal")({
  loader: ({ location }) => readPortal({ data: location.href }),
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
