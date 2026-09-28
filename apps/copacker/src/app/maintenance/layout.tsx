import { AppProviders } from "@/components/app-providers"

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}
