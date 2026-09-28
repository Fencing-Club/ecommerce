import { PackageOpen } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Page not found" }

// Shown in the shell when a portal page calls notFound(), such as for a malformed link or another workspace's purchase
// order. The header row comes first, so it sits beside the sidebar's collapse button, and the empty state below (built
// like EmptyState) doesn't repeat its title. Next renders this with every portal page in case it's needed, so it reads
// no session: every workspace has an Overview, and a forwarder's sends it on to its purchase orders.
export default function PortalNotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia className="text-muted-foreground">
            <PackageOpen aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyDescription>It may have been removed, or it’s in another workspace</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/overview" />}>
            Go to Overview
          </Button>
        </EmptyContent>
      </Empty>
    </>
  )
}
