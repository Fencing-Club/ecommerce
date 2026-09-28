"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { objectKeys } from "ts-extras"
import { Button } from "@/components/ui/button"
import { FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { type OAuthProvider, oauthProviders } from "@/lib/sign-in"

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden className="size-4">
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
  )
}

const logos: Record<OAuthProvider, () => React.ReactNode> = { google: GoogleLogo, microsoft: MicrosoftLogo }

// Google and Microsoft, side by side, then "or" before the email form. `email` suggests the account to use, such as
// an invitation's address.
export function SocialSignIn({ next, email }: { next: string; email?: string }) {
  // The provider being opened, which shows a spinner until the browser leaves.
  const [opening, setOpening] = useState<OAuthProvider | null>(null)
  const t = useTranslations("auth.social")
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        {objectKeys(oauthProviders).map((provider) => {
          const Logo = logos[provider]
          const query = new URLSearchParams({ next, ...(email && { email }) })
          return (
            <Button
              key={provider}
              variant="outline"
              className="h-10 gap-2.5"
              nativeButton={false}
              render={
                <a
                  href={`/login/${provider}?${query}`}
                  aria-label={t("continueWith", { provider: oauthProviders[provider].name })}
                  onClick={() => setOpening(provider)}
                />
              }
            >
              {opening === provider ? <Spinner /> : <Logo />}
              {oauthProviders[provider].name}
            </Button>
          )
        })}
      </div>
      <FieldSeparator className="text-xs">{t("or")}</FieldSeparator>
    </div>
  )
}
