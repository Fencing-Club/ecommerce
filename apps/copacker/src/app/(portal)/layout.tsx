import { Shell } from "@/components/shell"
import { session } from "@/server/auth"
export const dynamic = "force-dynamic"
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const s = await session()
  return (
    <Shell name={s.org.name} email={s.user.email} kind={s.org.kind} active={s.org.id} workspaces={s.workspaces}>
      {children}
    </Shell>
  )
}
