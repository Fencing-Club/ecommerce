"use client"

import { usePathname, useRouter } from "next/navigation"
import { Shell } from "@/components/shell"
import { SystemTimeZone } from "@/components/system-time-zone"
import { WorkspaceWatch } from "@/components/workspace-watch"

export function Portal(props: Omit<React.ComponentProps<typeof Shell>, "pathname" | "navigate">) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <Shell {...props} pathname={pathname} navigate={router.push}>
      <SystemTimeZone refresh={router.refresh} />
      <WorkspaceWatch id={props.active} pathname={pathname} />
      {props.children}
    </Shell>
  )
}
