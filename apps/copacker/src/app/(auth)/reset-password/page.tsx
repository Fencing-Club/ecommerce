import type { Metadata } from "next"
import Link from "next/link"
import { AuthPage } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/password-reset"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Choose a new password" }

// Where the reset email's link lands, with its token. WorkOS's Password reset URL setting points here.
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  if (!token) {
    return (
      <AuthPage title="This link is incomplete" description="Open the link from the email again, or ask for a new one.">
        <Button className="h-10 w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
          Send a new link
        </Button>
      </AuthPage>
    )
  }
  return (
    <AuthPage title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthPage>
  )
}
