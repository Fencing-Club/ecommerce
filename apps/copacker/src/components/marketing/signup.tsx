"use client"

import { ArrowRight, Check } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// The page's close: a signup for product news, on the orange stage, with the way in for anyone ready now.
export function Signup() {
  const t = useTranslations("marketing.signup")
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle")
  const [problem, setProblem] = useState("")
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setState("sending")
    const response = await fetch("/api/mailing-list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), website: form.get("website") })
    }).catch(() => null)
    if (response?.ok) {
      setState("done")
      return
    }
    const body: unknown = await response?.json().catch(() => null)
    setProblem(
      typeof body === "object" && body && "error" in body && typeof body.error === "string" ? body.error : t("failed")
    )
    setState("failed")
  }
  return (
    <div className="grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
      <div>
        <h2
          id="signup-title"
          className="text-[clamp(2.75rem,6.5vw,5.25rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance"
        >
          {t("title")}
        </h2>
        <p className="mt-6 max-w-md text-lg text-pretty text-white/80">{t("text")}</p>
      </div>
      <div className="flex flex-col gap-4">
        {state === "done" ? (
          <output className="flex h-12 items-center gap-3 text-lg font-medium">
            <span className="flex size-8 items-center justify-center rounded-full bg-white text-[#f54a00]">
              <Check className="size-5" strokeWidth={3} />
            </span>
            {t("done")}
          </output>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="signup-email" className="sr-only">
              {t("email")}
            </label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t("placeholder")}
              aria-invalid={state === "failed" || undefined}
              aria-describedby={state === "failed" ? "signup-problem" : undefined}
              className="h-12 flex-1 rounded-xl border-white/25 bg-white/10 px-4 text-base text-white placeholder:text-white/60 focus-visible:border-white focus-visible:ring-white/30"
            />
            {/* A field people never see, for telling bots apart. */}
            <input
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              className="absolute -left-[9999px] size-px opacity-0"
            />
            <Button
              type="submit"
              disabled={state === "sending"}
              className="h-12 rounded-xl bg-white px-5 text-base text-[#1c1917] hover:bg-white/90"
            >
              {state === "sending" ? t("subscribing") : t("subscribe")}
            </Button>
          </form>
        )}
        <p
          id="signup-problem"
          role="alert"
          className={cn("min-h-5 text-sm text-white", state !== "failed" && "sr-only")}
        >
          {state === "failed" ? problem : ""}
        </p>
        <Link
          href="/signup"
          className="group flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-white/85 outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
        >
          {t("getStartedNow")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </Link>
      </div>
    </div>
  )
}
