import { createFileRoute } from "@tanstack/react-router"
import Page from "@/app/(auth)/reset-password/page"
import { readAuthPage } from "@/auth.functions"
import { authSearch } from "@/lib/auth-pages"
export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: authSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readAuthPage({ data: { kind: "reset-password", query: deps } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? loaderData.title + " | Copacker" : "Copacker" }] }),
  component: Screen
})
function Screen() {
  return <Page page={Route.useLoaderData().page} />
}
