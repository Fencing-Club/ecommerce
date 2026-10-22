import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AccessProvider } from "@/components/access"
import { OverviewPagePending, OverviewPageView } from "@/components/overview-page"
import { PortalError } from "@/components/portal-error"
import { PortalForbidden } from "@/components/portal-forbidden"
import { Providers } from "@/components/providers"
import { Shell } from "@/components/shell"
import { SystemTimeZone } from "@/components/system-time-zone"
import { WorkspaceWatch } from "@/components/workspace-watch"
import { periodSearch } from "@/lib/date-range"
import { overviewSearch } from "@/lib/page-search"
import { readOverview } from "../portal.functions"

export const Route = createFileRoute("/overview")({
  validateSearch: overviewSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readOverview({ data: deps }),
  staleTime: 0,
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title }, { name: "robots", content: "noindex, nofollow" }]
  }),
  pendingComponent: OverviewPagePending,
  errorComponent: OverviewError,
  component: OverviewRoute
})

function OverviewError() {
  const router = useRouter()
  return (
    <main id="main-content" className="p-8">
      <PortalError
        retry={() => {
          void router.invalidate()
        }}
      />
    </main>
  )
}

function OverviewRoute() {
  const data = Route.useLoaderData()
  const query = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const { shell, page } = data
  const refresh = () => {
    void router.invalidate()
  }
  return (
    <Providers key={shell.active}>
      <AccessProvider permissions={shell.permissions}>
        <Shell
          {...shell}
          pathname="/overview"
          navigate={(href) => {
            void router.navigate({ href })
          }}
        >
          <SystemTimeZone refresh={refresh} />
          <WorkspaceWatch id={shell.active} pathname="/overview" />
          {data.forbidden ? (
            <PortalForbidden />
          ) : (
            page && (
              <OverviewPageView
                page={page}
                refresh={refresh}
                onPeriodChange={(period) => {
                  void navigate({ search: { channel: query.channel, ...periodSearch(period) } })
                }}
                onChannelChange={(channel) => {
                  void navigate({ search: { ...query, channel: channel ?? undefined } })
                }}
              />
            )
          )}
        </Shell>
      </AccessProvider>
    </Providers>
  )
}
