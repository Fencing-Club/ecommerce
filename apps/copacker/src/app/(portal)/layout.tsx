import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Shell } from "@/components/shell"
import { SystemTimeZone } from "@/components/system-time-zone"
import { session } from "@/server/auth"
import { ownProfile } from "@/server/profile"
export const dynamic = "force-dynamic"
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await session()
  // Everyone gives their name, position and company first, so comments show who wrote them. x-url is the full request URL; only its path is
  // kept to come back to.
  if (!(await ownProfile(s.user.id)).complete) {
    const url = (await headers()).get("x-url")
    const back = url && URL.canParse(url) ? `${new URL(url).pathname}${new URL(url).search}` : "/"
    redirect(`/profile?next=${encodeURIComponent(back)}`)
  }
  return (
    <Shell name={s.org.name} email={s.user.email} kind={s.org.kind} active={s.org.id} workspaces={s.workspaces}>
      <SystemTimeZone />
      {children}
    </Shell>
  )
}
