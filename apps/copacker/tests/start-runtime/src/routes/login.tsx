import { createFileRoute } from "@tanstack/react-router"
import { AuthScreen } from "@/components/auth/auth-screen"
import { AuthShell } from "@/components/auth/auth-shell"
import { Providers } from "@/components/providers"
import { authSearch } from "@/lib/auth-pages"
import { readAuthPage } from "../auth.functions"

export const Route = createFileRoute("/login")({
  validateSearch: authSearch,
  loaderDeps: ({ search }) => ({ query: search }),
  loader: ({ deps }) => readAuthPage({ data: { kind: "login", ...deps } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }] }),
  component: AuthRoute
})

function AuthRoute() {
  const { page } = Route.useLoaderData()
  return (
    <Providers>
      <AuthShell>
        <AuthScreen page={page} />
      </AuthShell>
    </Providers>
  )
}
