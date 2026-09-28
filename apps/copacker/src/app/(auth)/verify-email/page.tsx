import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { pendingVerification } from "@/server/sign-in"

export const metadata: Metadata = { title: "Check your email" }

export const dynamic = "force-dynamic"

// After signing up, or signing in to an account whose email isn't confirmed yet: the code WorkOS emailed.
export default async function VerifyEmail() {
  const pending = await pendingVerification()
  if (!pending) {
    redirect("/login")
  }
  return (
    <AuthPage
      title="Check your email"
      description={
        <>
          Enter the code we sent to <span className="font-medium text-foreground">{pending.email}</span>.
        </>
      }
    >
      <VerifyEmailForm />
      <AuthSwitch prompt="Wrong email?" href="/signup">
        Start again
      </AuthSwitch>
    </AuthPage>
  )
}
