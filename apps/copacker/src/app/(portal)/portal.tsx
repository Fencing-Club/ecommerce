import { useLocation, useRouter } from "@tanstack/react-router"
import { Shell } from "@/components/shell"
import { useSystemTimeZone } from "@/hooks/use-system-time-zone"
import { useWorkspaceWatch } from "@/hooks/use-workspace-watch"

export function Portal(props: Omit<React.ComponentProps<typeof Shell>, "pathname" | "navigate">) {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  useSystemTimeZone(router.invalidate)
  useWorkspaceWatch({ id: props.active, pathname })
  return (
    <Shell {...props} pathname={pathname} navigate={(href) => router.navigate({ href })}>
      {props.children}
    </Shell>
  )
}
