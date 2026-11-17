import { Button } from "@buildkitgg/shadcn"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Box } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { cn } from "@/lib/utils"
import { Bar } from "./bar"
import { paper, quiet } from "./site-styles"

// The marketing site's frame, shared by its pages (home, contact, privacy and terms): its grounds and type treatments,
// the nav bar and the footer. The site is set on warm paper, with dark stages set into it.

// Copacker lets teams in a few at a time, so the way in is the waitlist at the foot of the home page.
export function JoinWaitlist({ className }: { className?: string }) {
  const t = useTranslations("marketing.site")
  return (
    <Button
      size="lg"
      className={cn("h-11 gap-2 rounded-xl px-5 text-[0.9375rem]", className)}
      nativeButton={false}
      render={<Link to="/" hash="waitlist" />}
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
  const link = "focus-ring rounded-sm transition-colors hover:text-foreground"
  return (
    <Bar tone={tone}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
        <Link to="/" className="focus-ring rounded-md">
          <BrandMark />
        </Link>
        <nav aria-label={t("mainNav")} className="hidden items-center gap-7 text-sm text-foreground/60 md:flex">
          {sections.map((section) => (
            <a key={section} href={`/#${section}`} className={link}>
              {t(`sections.${section}`)}
            </a>
          ))}
          <Link to="/contact" className={link}>
            {t("contact")}
          </Link>
        </nav>
        <div className="ms-auto flex items-center">
          <Button nativeButton={false} render={<Link to="/" hash="waitlist" />}>
            {t("joinWaitlist")}
          </Button>
        </div>
      </div>
    </Bar>
  )
}

function Footer() {
  const t = useTranslations("marketing.site")
  // Read once, in a lazy initializer, so the year is not recomputed on each render.
  const [year] = useState(() => new Date().getFullYear())
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
                <Link key={href} to="." href={href} className="w-fit text-foreground/80 hover:text-foreground">
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
        <span>© {year} Copacker</span>
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
