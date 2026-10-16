import { useLocation, useRouter } from "@tanstack/react-router"
import { Shell } from "@/components/shell"
import { SystemTimeZone } from "@/components/system-time-zone"
import { WorkspaceWatch } from "@/components/workspace-watch"

export function Portal(props: Omit<React.ComponentProps<typeof Shell>, "pathname" | "navigate">) {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  return (
    <Shell {...props} pathname={pathname} navigate={(href) => router.navigate({ href })}>
      <SystemTimeZone refresh={router.invalidate} />
      <WorkspaceWatch id={props.active} pathname={pathname} />
      {props.children}
    </Shell>
  )
}
