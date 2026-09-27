import { UserRound } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/profile-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { session } from "@/server/auth"
import { ownProfile } from "@/server/profile"
import { returnPath } from "@/server/security"
import { brandTile, centeredPage, mutedBackground } from "../shell.css"

export const metadata: Metadata = { title: "Your profile" }

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"
// Asked once, before the portal: the name, position and company everyone sees on this person's comments.
export default async function Profile({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const s = await session()
  const next = returnPath((await searchParams).next ?? null, "/")
  const { profile, complete } = await ownProfile(s.user.id)
  if (complete) {
    redirect(next)
  }
  return (
    <main id="main-content" className={cn(centeredPage, mutedBackground)}>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className={brandTile}>
            <UserRound className="size-5" />
          </div>
          <CardTitle className="text-xl">Tell us about you</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            then={next}
            profile={{
              firstName: profile?.firstName ?? "",
              lastName: profile?.lastName ?? "",
              position: profile?.position ?? "",
              company: profile?.company || s.org.name
            }}
          />
        </CardContent>
      </Card>
    </main>
  )
}
