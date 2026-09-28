import type { Metadata } from "next"
import { ForgotPassword } from "@/components/auth/password-reset"

export const metadata: Metadata = { title: "Reset your password" }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  return <ForgotPassword email={(await searchParams).email} />
}
