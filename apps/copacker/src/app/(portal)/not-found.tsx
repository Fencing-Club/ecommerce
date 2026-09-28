import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Page not found" }

// Shown in the shell when a portal page calls notFound(), such as for another workspace's purchase order or shipment.
// The empty state comes first, so it sits beside the sidebar's collapse button. Next renders this with every portal
// page in case it's needed, so it reads no session; the Overview sends suppliers and forwarders on to their purchase
// orders.
export default function PortalNotFound() {
  return (
    <EmptyState title="Page not found" description="It may have been removed, or it’s in another workspace">
      <Button nativeButton={false} render={<Link href="/overview" />}>
        Go to Overview
      </Button>
    </EmptyState>
  )
}
