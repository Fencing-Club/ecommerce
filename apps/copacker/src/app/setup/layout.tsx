import { AppProviders } from "@/components/app-providers"

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}
