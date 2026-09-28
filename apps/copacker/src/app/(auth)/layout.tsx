import { AppProviders } from "@/components/app-providers"
import { AuthShell } from "@/components/auth/auth-shell"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <AuthShell>{children}</AuthShell>
    </AppProviders>
  )
}
