import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AppProviders } from "@/components/app-providers"
import { AuthShell } from "@/components/auth/auth-shell"

export const Route = createFileRoute("/_auth")({ component: AuthLayout })
function AuthLayout() {
  return (
    <AppProviders>
      <AuthShell>
        <Outlet />
      </AuthShell>
    </AppProviders>
  )
}
