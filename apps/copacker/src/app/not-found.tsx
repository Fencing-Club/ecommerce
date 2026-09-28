import type { Metadata } from "next"
import Link from "next/link"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Page not found" }

// A URL that matches no page, outside the app's shell. A portal page that can't find a record shows the portal's own
// not-found page instead. "/" takes someone signed in to their workspace, and anyone else to sign in.
export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-svh items-center justify-center p-6">
      <EmptyState title="Page not found" description="Check the address and try again">
        <Button nativeButton={false} render={<Link href="/" />}>
          Go to Copacker
        </Button>
      </EmptyState>
    </main>
  )
}
