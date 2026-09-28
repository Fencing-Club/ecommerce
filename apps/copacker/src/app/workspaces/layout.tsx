import { AppProviders } from "@/components/app-providers"

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}
