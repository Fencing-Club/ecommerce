import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AccessProvider } from "@/components/access"
import { AppProviders } from "@/components/app-providers"
import { Shell } from "@/components/shell"
import { SystemTimeZone } from "@/components/system-time-zone"
import { WorkspaceWatch } from "@/components/workspace-watch"
import { session } from "@/server/auth"
import { withRequest } from "@/server/next-request"
import { ownProfile } from "@/server/profile"
export const dynamic = "force-dynamic"
export default withRequest(async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await session()
  // Everyone gives their name and position first, so comments show who wrote them; getting started asks for just that
  // and comes back. x-url is the full request URL; only its path is kept to come back to.
  if (!(await ownProfile(s.user.id)).complete) {
    const url = (await headers()).get("x-url")
    const back = url && URL.canParse(url) ? `${new URL(url).pathname}${new URL(url).search}` : "/"
    redirect(`/onboarding?next=${encodeURIComponent(back)}`)
  }
  return (
    <AppProviders>
      <AccessProvider permissions={{ role: s.role, access: s.access }}>
        <Shell
          name={s.org.name}
          userName={s.user.name}
          email={s.user.email}
          kind={s.org.kind}
          active={s.org.id}
          workspaces={s.workspaces}
        >
          <SystemTimeZone />
          <WorkspaceWatch id={s.org.id} />
          {children}
        </Shell>
      </AccessProvider>
    </AppProviders>
  )
})
