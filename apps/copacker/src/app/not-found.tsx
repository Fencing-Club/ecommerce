import type { Metadata } from "next"
import Link from "next/link"
import { BrandMark } from "@/components/auth/stage"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Page not found" }

// A URL that matches no page, outside the app's shell: Copacker's name along the top, as the app's header has it, and
// the empty state in the middle. A portal page that can't find a record shows the portal's own not-found page instead.
// "/" takes someone signed in to their workspace, and anyone else to sign in.
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 shrink-0 items-center border-b px-4">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark />
        </Link>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center p-6">
        <EmptyState title="Page not found" description="Check the address and try again">
          <Button nativeButton={false} render={<Link href="/" />}>
            Go to Copacker
          </Button>
        </EmptyState>
      </main>
    </div>
  )
}
