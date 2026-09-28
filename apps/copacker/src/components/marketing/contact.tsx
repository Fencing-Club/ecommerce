import { ArrowRight, BookOpen, Film as FilmIcon, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { ContactForm } from "./contact-form"
import { DotField } from "./dot-field"
import { Film } from "./film"
import { JoinWaitlist, lift, lit, rise, Site, stage } from "./site"

// The contact page, in the home page's language: a dark stage with the settled field of points, and the form set across
// its lower edge the way the hero's product shot is, then other ways in on the paper below.

// The title's lit words.
const litWords = (chunks: React.ReactNode) => <span className={lit}>{chunks}</span>

function Way({
  icon: Icon,
  title,
  text,
  children
}: {
  icon: typeof Sparkles
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-background p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_24px_60px_-40px_rgb(60_30_10/0.35)] sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-pretty text-muted-foreground">{text}</p>
      </div>
      <div className="mt-auto pt-2">{children}</div>
    </div>
  )
}

export function Contact() {
  const t = useTranslations("marketing.contact")
  return (
    <Site>
      <main id="main-content">
        <section aria-labelledby="contact-title" className="relative -mt-16">
          <div
            data-tone="dark"
            className={cn(stage, "relative isolate flow-root rounded-b-[2rem] pt-16 sm:rounded-b-[3rem]")}
          >
            <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden rounded-b-[inherit]">
              <DotField settled className="[mask-image:linear-gradient(to_bottom,black_25%,transparent_80%)]" />
              <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(ellipse_55%_60%_at_50%_100%,rgb(255_122_46/0.3),rgb(255_122_46/0.08)_55%,transparent)]" />
            </div>
            <div className="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
              <h1
                id="contact-title"
                className={cn("text-[clamp(3.25rem,9vw,7rem)] leading-[0.92] font-semibold tracking-[-0.055em]", lift)}
                style={{ animationDelay: "100ms" }}
              >
                {t.rich("title", { lit: litWords })}
              </h1>
              <p
                className={cn("mt-6 max-w-xl text-lg text-pretty text-white/65 sm:text-xl", lift)}
                style={{ animationDelay: "250ms" }}
              >
                {t("text")}
              </p>
            </div>
            <div className={cn("mx-auto max-w-6xl px-6 pt-14 sm:pt-16", rise)} style={{ animationDelay: "400ms" }}>
              <div className="-mb-40">
                <ContactForm />
              </div>
            </div>
          </div>
          <div aria-hidden className="h-40" />
        </section>
        <section aria-labelledby="ways-title" className="mx-auto max-w-6xl px-6 pt-24 pb-28 sm:pt-28 sm:pb-36">
          <h2
            id="ways-title"
            className="text-[clamp(2rem,4vw,3rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance"
          >
            {t("waysTitle")}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Way icon={Sparkles} title={t("waitlistTitle")} text={t("waitlistText")}>
              <JoinWaitlist />
            </Way>
            <Way icon={FilmIcon} title={t("watchTitle")} text={t("watchText")}>
              <Film className="border-border bg-transparent text-foreground hover:bg-muted" />
            </Way>
            <Way icon={BookOpen} title={t("faqTitle")} text={t("faqText")}>
              <a
                href="/#faq"
                className="group inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-[0.9375rem] font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("questions")}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
              </a>
            </Way>
          </div>
        </section>
      </main>
    </Site>
  )
}
