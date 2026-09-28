import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { quiet, Site } from "./site"
import "./stylesheet"

// The unsubscribe page: one question and one button, then the answer. It sits on the marketing site's paper.
export function Unsubscribe({
  email,
  token,
  state
}: {
  email: string
  token: string
  state: "confirm" | "done" | "failed" | "invalid"
}) {
  const t = useTranslations("marketing.unsubscribe")
  const title = { confirm: t("title"), done: t("doneTitle"), failed: t("title"), invalid: t("invalidTitle") }[state]
  const text = {
    confirm: t("text", { email }),
    done: t("doneText", { email }),
    failed: t("failed"),
    invalid: t("invalidText")
  }[state]
  const asking = state === "confirm" || state === "failed"
  return (
    <Site tone="light">
      <main
        id="main-content"
        className="mx-auto flex min-h-[60svh] max-w-xl flex-col justify-center px-6 py-24 sm:py-32"
      >
        <h1 className="text-[clamp(2rem,5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-balance urdu:leading-[1.6] urdu:tracking-normal">
          {title}
        </h1>
        <p className={cn("mt-4 text-lg text-pretty", quiet)}>{text}</p>
        {asking ? (
          <form method="post" action="/api/mailing-list/unsubscribe" className="mt-8">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="from" value="page" />
            <Button type="submit" size="lg" className="h-11 rounded-xl px-5 text-[0.9375rem]">
              {t("action")}
            </Button>
          </form>
        ) : (
          <Link
            href="/"
            className="group mt-8 inline-flex w-fit items-center gap-2 rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("home")}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        )}
      </main>
    </Site>
  )
}
