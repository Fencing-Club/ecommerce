import type { Metadata } from "next"
import { BrandMark } from "@/components/auth/stage"

export const metadata: Metadata = { title: "Setup" }

// Where sign-in sends everyone until WorkOS is configured. It looks like the sign-in pages' form column on its own:
// Copacker's name at the top, and the title and its one line in the middle, rising in as the page opens.
export default function Setup() {
  return (
    <div className="flex min-h-svh flex-col bg-background px-6 pt-6 pb-10 sm:px-10">
      <header>
        <BrandMark />
      </header>
      <main id="main-content" className="flex flex-1 flex-col justify-center py-12">
        <div className="mx-auto flex w-full max-w-[22.5rem] flex-col gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:ease-out">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance">
            Sign-in isn’t set up yet
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">
            This installation is missing its WorkOS configuration.
          </p>
        </div>
      </main>
    </div>
  )
}
