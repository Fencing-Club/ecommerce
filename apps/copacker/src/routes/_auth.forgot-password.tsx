import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(auth)/forgot-password/page"
import { readAuthPage } from "@/auth.functions"
import { authSearch } from "@/lib/auth-pages"
export const Route = createFileRoute("/_auth/forgot-password")({
  validateSearch: authSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readAuthPage({ data: { kind: "forgot-password", query: deps } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? loaderData.title + " | Copacker" : "Copacker" }] }),
  component: Screen
})
function Screen() {
  return <Page page={Route.useLoaderData().page} />
}
