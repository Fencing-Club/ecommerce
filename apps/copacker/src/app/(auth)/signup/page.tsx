import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { AuthPage, AuthSwitch } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { signedInUser } from "@/server/auth"
import { returnPath } from "@/server/security"

export const metadata: Metadata = { title: "Create your account" }

// Rendered per request: at build time the WorkOS settings are absent, so a prerendered page would always go to setup.
export const dynamic = "force-dynamic"

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
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
    <AuthPage title="Create your account">
      <div className="flex flex-col gap-6">
        <SocialSignIn next={next} />
        <SignUpForm next={next} email={query.email} />
      </div>
      <AuthSwitch prompt="Already have an account?" href={`/login${onward}`}>
        Sign in
      </AuthSwitch>
    </AuthPage>
  )
}
