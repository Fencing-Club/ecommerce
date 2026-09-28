import { AppProviders } from "@/components/app-providers"

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>
}
