import { CircleAlert } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signedInUser } from "@/server/auth"
import { returnPath } from "@/server/security"

export const metadata: Metadata = { title: "Sign in" }

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

export default async function Login({
  searchParams
}: {
  searchParams: Promise<{ next?: string; email?: string; error?: string }>
}) {
  if (!process.env.WORKOS_CLIENT_ID) {
    redirect("/setup")
  }
  const query = await searchParams
  const next = returnPath(query.next, "/")
  if (await signedInUser()) {
    redirect(next)
  }
  const onward = next === "/" ? "" : `?${new URLSearchParams({ next })}`
  return (
    <AuthPage title="Sign in to Copacker">
      {query.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>Couldn’t sign in with that account. Try again.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-6">
        <SocialSignIn next={next} />
        <SignInForm next={next} email={query.email} />
      </div>
      <AuthSwitch prompt="New to Copacker?" href={`/signup${onward}`}>
        Create an account
      </AuthSwitch>
    </AuthPage>
  )
}
