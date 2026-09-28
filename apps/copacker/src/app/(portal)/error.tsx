"use client"

import { CircleAlert } from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

// Shown in the shell when a portal page fails, so the sidebar and header stay. The header row comes first, beside the
// sidebar's collapse button, and the empty state below is built like EmptyState. Trying again fetches the page afresh
// (`retry`; `reset` would only re-render what already failed). Every workspace has an Overview.
export default function PortalError({ retry }: { retry: () => void }) {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <Empty className="gap-4 py-10">
        <EmptyHeader className="gap-1">
          <EmptyMedia className="text-muted-foreground">
            <CircleAlert aria-hidden className="size-5" />
          </EmptyMedia>
          <EmptyTitle>
            <h2>This page didn’t load</h2>
          </EmptyTitle>
          <EmptyDescription>Your data hasn’t changed</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={retry}>Try again</Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/overview" />}>
              Go to Overview
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    </>
  )
}
