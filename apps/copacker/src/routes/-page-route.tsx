import { type ErrorComponentProps, getRouteApi, useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import AuthError from "@/app/(auth)/error"
import PortalErrorPage from "@/app/(portal)/error"
import ForbiddenPage from "@/app/(portal)/forbidden"
import ErrorPage from "@/app/error"
import { readAuthPage } from "@/auth.functions"
import { AuthScreen } from "@/components/auth/auth-screen"
import { type AuthPageKind, type AuthSearch, authSearch } from "@/lib/auth-pages"
import { pageTitle } from "@/lib/page-title"
import type { PageResult } from "@/server/page-result"

// What every page route shares. The routes in this folder only say which data and page they are.

// A page's document title, from the title its loader read in the viewer's language. Without loaded data, such as on
// Not found, the document's own title stays.
export function pageHead({ loaderData }: { loaderData?: { title: string } }) {
  return { meta: loaderData ? [{ title: pageTitle(loaderData.title) }] : [] }
}

// A portal page: No access when the viewer's role can't open it, or else the page with its data.
export function PortalPage<R extends PageResult<unknown>>({
  result,
  children
}: {
  result: R
  children: (data: Extract<R, { forbidden: false }>["data"]) => ReactNode
}) {
  return result.forbidden ? <ForbiddenPage /> : children(result.data)
}

// Trying again loads the page afresh before clearing the error; resetting alone would only re-render what failed.
function useRetry(reset: ErrorComponentProps["reset"]) {
  const router = useRouter()
  return () => {
    void router.invalidate().then(reset)
  }
}

// The router's default: a page that failed outside the portal's shell, or the shell itself.
export function RouteError({ reset }: ErrorComponentProps) {
  return <ErrorPage retry={useRetry(reset)} />
}

// A portal page that failed, inside the shell.
export function PortalRouteError({ reset }: ErrorComponentProps) {
  return <PortalErrorPage retry={useRetry(reset)} />
}

// A page in the sign-in pages' layout that failed, inside that layout.
export function AuthRouteError({ reset }: ErrorComponentProps) {
  return <AuthError retry={useRetry(reset)} />
}

// One of the sign-in pages, which share their search, loader and screen.
export function authRoute(kind: AuthPageKind) {
  const route = getRouteApi(`/_auth/${kind}`)
  function AuthRoute(): ReactNode {
    return <AuthScreen page={route.useLoaderData().page} />
  }
  return {
    validateSearch: authSearch,
    loaderDeps: ({ search }: { search: AuthSearch }) => search,
    loader: ({ deps }: { deps: AuthSearch }) => readAuthPage({ data: { kind, query: deps } }),
    head: pageHead,
    errorComponent: AuthRouteError,
    component: AuthRoute
  }
}
