import { ArrowRight, Box } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Bar } from "./bar"

// The marketing site's frame, shared by its pages (home, contact, privacy and terms): its grounds and type treatments,
// the nav bar and the footer. The site is set on warm paper, with dark stages set into it.

// The two grounds: the paper, and the ink of the stages set into it.
export const paper = "light bg-(--paper) text-foreground [color-scheme:light]"
export const stage = "dark bg-(--ink) text-foreground [color-scheme:dark]"
// Secondary text. The theme's muted gray is set for white, and on the warmer paper it falls short of AA contrast.
export const quiet = "text-foreground/60"
// Copacker's orange, lit from above, as the ad's end card has it.
export const lit = "bg-[linear-gradient(180deg,#ffb27a_0%,#ff7a2e_45%,#f54a00_100%)] bg-clip-text text-transparent"
// Rises into place as the page loads, after its animation delay.
export const rise =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"

// Copacker lets teams in a few at a time, so the way in is the waitlist at the foot of the home page.
export function JoinWaitlist({ className }: { className?: string }) {
  const t = useTranslations("marketing.site")
  return (
    <Button
      size="lg"
      className={cn("h-11 gap-2 rounded-xl px-5 text-[0.9375rem]", className)}
      nativeButton={false}
      render={<Link href="/#waitlist" />}
    >
      {t("joinWaitlist")}
      <ArrowRight className="rtl:rotate-180" />
    </Button>
  )
}

// The home page's sections, as the nav bar and the footer link to them.
const sections = ["forecast", "handoffs", "agents", "faq"] as const

function Nav({ tone }: { tone: "dark" | "light" }) {
  const t = useTranslations("marketing.site")
  const link =
    "rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
  return (
    <Bar tone={tone}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark />
        </Link>
        <nav aria-label={t("mainNav")} className="hidden items-center gap-7 text-sm text-foreground/60 md:flex">
          {sections.map((section) => (
            <a key={section} href={`/#${section}`} className={link}>
              {t(`sections.${section}`)}
            </a>
          ))}
          <Link href="/contact" className={link}>
            {t("contact")}
          </Link>
        </nav>
        <div className="ms-auto flex items-center">
          <Button nativeButton={false} render={<Link href="/#waitlist" />}>
            {t("joinWaitlist")}
          </Button>
        </div>
      </div>
    </Bar>
  )
}

function Footer() {
  const t = useTranslations("marketing.site")
  const columns = [
    { title: t("footer.product"), links: sections.map((section) => [`/#${section}`, t(`sections.${section}`)]) },
    {
      title: t("footer.company"),
      links: [
        ["/contact", t("contact")],
        ["/privacy", t("footer.privacy")],
        ["/terms", t("footer.terms")]
      ]
    }
  ]
  return (
    <footer className={paper}>
      {/* The two link groups stay side by side down to a phone, with the brand above them until there's room beside. */}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-12 px-6 pt-24 pb-12 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-20">
        <div className="col-span-2 flex flex-col gap-5 md:col-span-1">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Box className="size-5" />
          </span>
          <p className={cn("max-w-xs", quiet)}>{t("footer.tagline")}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3 text-sm">
            <span className={quiet}>{column.title}</span>
            {column.links.map(([href = "/", label]) =>
              href.startsWith("/#") ? (
                <a key={href} href={href} className="w-fit text-foreground/80 hover:text-foreground">
                  {label}
                </a>
              ) : (
                <Link key={href} href={href} className="w-fit text-foreground/80 hover:text-foreground">
                  {label}
                </Link>
              )
            )}
          </nav>
        ))}
      </div>
      <div
        className={cn(
          "mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-foreground/10 px-6 py-6 text-xs",
          quiet
        )}
      >
        <span>© {new Date().getFullYear()} Copacker</span>
        <span>copacker.ai</span>
      </div>
    </footer>
  )
}

// `tone` is the ground at the top of the page, where the nav bar starts.
export function Site({ tone = "dark", children }: { tone?: "dark" | "light"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        paper,
        "relative min-h-svh overflow-x-clip [--ink:oklch(0.145_0_0)] [--paper:oklch(0.972_0.008_78)]"
      )}
    >
      <Nav tone={tone} />
      {children}
      <Footer />
    </div>
  )
}
