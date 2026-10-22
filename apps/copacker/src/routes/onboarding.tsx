import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/onboarding/page"
import { AppProviders } from "@/components/app-providers"
import { onboardingSearch, readOnboarding } from "@/onboarding.functions"
import { pageHead } from "./-page-route"

export const Route = createFileRoute("/onboarding")({
  validateSearch: onboardingSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOnboarding({ data: deps }),
  head: pageHead,
  component: Screen
})
function Screen() {
  return (
    <AppProviders>
      <Page page={Route.useLoaderData().page} />
    </AppProviders>
  )
}
