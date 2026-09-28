import { Lock } from "lucide-react"
import type { Metadata } from "next"
import { PageHeader } from "@/components/common"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"

export const metadata: Metadata = { title: "No access" }

// Shown in the shell when a member opens a page they weren't given, such as from a colleague's link. Like the portal's
// not-found page, it reads no session; the sidebar lists the pages they can open.
export default function PortalForbidden() {
  return (
    <>
      <PageHeader title="No access" />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia className="text-muted-foreground">
            <Lock aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyDescription>Ask an admin for access</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  )
}
