import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/onboarding/page"
import { AppProviders } from "@/components/app-providers"
import { onboardingSearch, readOnboarding } from "@/onboarding.functions"
export const Route = createFileRoute("/onboarding")({
  validateSearch: onboardingSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOnboarding({ data: deps }),
  component: Screen
})
function Screen() {
  return (
    <AppProviders>
      <Page page={Route.useLoaderData()} />
    </AppProviders>
  )
}
