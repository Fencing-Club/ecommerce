"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { centeredPage } from "./shell.css"

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className={centeredPage}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle />
          </EmptyMedia>
          <EmptyTitle>We couldn’t load this page</EmptyTitle>
          <EmptyDescription>Your data hasn’t changed. Try again, or check your account connections.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={reset}>Try again</Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
