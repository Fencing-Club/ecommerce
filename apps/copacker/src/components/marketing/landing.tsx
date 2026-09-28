import { useFormatter, useTranslations } from "next-intl"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { Agents } from "./agents"
import { Connect } from "./connect"
import { DotField } from "./dot-field"
import { Film } from "./film"
import { Journey } from "./journey"
import { RestockShot } from "./mockups"
import { Planner } from "./planner"
import { Scaled } from "./scaled"
import { Signup } from "./signup"
import { GetStarted, lit, quiet, rise, Site, stage } from "./site"
import { Tilt } from "./tilt"

// The marketing page anyone signed out sees at /. It's set on warm paper, with dark stages set into it: the hero, where
// the mess a restock makes settles into order, and the diagrams of the handoffs and agents. The product shots are the
// app's own components with demo data (./mockups). There are no paid plans yet, so it asks only for a sign-up.

// A product shot: the app window in a thin glass bezel. The caption is for screen readers.
function Shot({
  width,
  height,
  caption,
  className,
  children
}: {
  width: number
  height: number
  caption: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <figure className={cn("relative", className)}>
      <div className="rounded-[1.25rem] bg-white/[0.08] p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_0_0_2px_rgb(0_0_0/0.04),0_50px_120px_-40px_rgb(40_20_5/0.55)]">
        <div className="overflow-hidden rounded-[0.875rem]">
          <Scaled width={width} height={height}>
            {children}
          </Scaled>
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  )
}

// The headline's two halves rise in one after the other, and the second is lit.
const firstWords = (chunks: React.ReactNode) => (
  <span className={cn("inline-block", rise)} style={{ animationDelay: "150ms" }}>
    {chunks}
  </span>
)
const secondWords = (chunks: React.ReactNode) => (
  <span className={cn("inline-block", rise, lit)} style={{ animationDelay: "320ms" }}>
    {chunks}
  </span>
)

// The hero's stage ends partway down the product shot, which carries on over the paper below. The shot's overhang is a
// share of its width, as margins and padding in percent are, so the space kept for it below matches at any size.
function Hero() {
  const t = useTranslations("marketing.hero")
  const site = useTranslations("marketing.site")
  const format = useFormatter()
  const dollars = (value: number) =>
    format.number(value, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
  return (
    <section className="relative -mt-16">
      <div
        data-tone="dark"
        className={cn(stage, "relative isolate flow-root rounded-b-[2rem] pt-16 sm:rounded-b-[3rem]")}
      >
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden rounded-b-[inherit]">
          <DotField className="[mask-image:linear-gradient(to_bottom,black_30%,transparent_72%)]" />
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgb(255_122_46/0.32),rgb(255_122_46/0.08)_55%,transparent)]" />
        </div>
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pt-28 text-center sm:pt-36">
          {/* A soft, wide shade behind the words, so they read clearly over the points. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-56 -top-8 -bottom-40 -z-10 bg-[radial-gradient(closest-side,oklch(0.145_0_0/0.65),oklch(0.145_0_0/0.5)_35%,oklch(0.145_0_0/0.25)_65%,oklch(0.145_0_0/0.08)_85%,transparent)]"
          />
          <h1 className="text-[clamp(3.5rem,11vw,8rem)] leading-[0.92] font-semibold tracking-[-0.055em]">
            {t.rich("title", { first: firstWords, second: secondWords })}
          </h1>
          <p
            className={cn("mt-8 max-w-2xl text-lg text-pretty text-white/65 sm:text-xl", rise)}
            style={{ animationDelay: "520ms" }}
          >
            {t("text")}
          </p>
          <div
            className={cn("mt-10 flex flex-wrap items-center justify-center gap-3", rise)}
            style={{ animationDelay: "680ms" }}
          >
            <GetStarted />
            <Film />
          </div>
          <p className={cn("mt-4 text-sm text-white/50", rise)} style={{ animationDelay: "800ms" }}>
            {site("free")}
          </p>
        </div>
        <div className={cn("mx-auto max-w-6xl px-6 pt-20 sm:pt-24", rise)} style={{ animationDelay: "900ms" }}>
          <div className="-mb-[27%]">
            <Tilt>
              <Shot
                width={1280}
                height={800}
                caption={t("shotCaption", { cost: dollars(15_090), lost: dollars(18_340) })}
              >
                <RestockShot />
              </Shot>
            </Tilt>
          </div>
        </div>
      </div>
      <div aria-hidden className="mx-auto max-w-6xl px-6">
        <div className="pt-[27%]" />
      </div>
    </section>
  )
}

function Section({
  id,
  title,
  text,
  children
}: {
  id: string
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto max-w-6xl scroll-mt-16 px-6 py-28 sm:py-36">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
        <h2
          id={`${id}-title`}
          className="text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance"
        >
          {title}
        </h2>
        <p className={cn("text-lg text-pretty", quiet)}>{text}</p>
      </div>
      <div className="mt-16 sm:mt-20">{children}</div>
    </section>
  )
}

// A dark stage set into the paper, lit warm from above over a faint grid.
function Island({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-tone="dark"
      className={cn(stage, "relative isolate mx-2 overflow-hidden rounded-[2rem] sm:mx-3 sm:rounded-[3rem]", className)}
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -top-80 left-1/2 h-[64rem] w-[90rem] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(255_122_46/0.14),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_35%,black,transparent)] bg-[size:4rem_4rem]" />
      </div>
      {children}
    </div>
  )
}

// The questions the FAQ answers, each a key under marketing.faq.questions with its question and answer.
const questions = [
  "cost",
  "stores",
  "warehouse",
  "locations",
  "tracking",
  "forwarders",
  "suppliers",
  "awd",
  "documents",
  "mcp",
  "cli"
] as const

function Faq() {
  const t = useTranslations("marketing.faq")
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-28 sm:py-36">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <h2
          id="faq-title"
          className="text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          {t("title")}
        </h2>
        {/* All closed to start, so people open the ones they care about. Closed answers stay in the page, hidden
            until found, so find in page and search engines still reach them. */}
        <Accordion multiple className="border-t border-foreground/10">
          {questions.map((question) => (
            <AccordionItem key={question} value={question} className="border-b border-foreground/10">
              <AccordionTrigger className="gap-6 py-6 text-lg font-medium tracking-[-0.01em] transition-colors hover:text-foreground/70 hover:no-underline **:data-[slot=accordion-trigger-icon]:mt-1 **:data-[slot=accordion-trigger-icon]:size-5">
                {t(`questions.${question}.question`)}
              </AccordionTrigger>
              <AccordionContent hiddenUntilFound className={cn("max-w-[60ch] pb-7 text-base text-pretty", quiet)}>
                {t(`questions.${question}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

// The close: product news by email on an orange stage, rather than the hero again.
function Closing() {
  return (
    <section
      data-tone="dark"
      aria-labelledby="signup-title"
      className="dark relative isolate mx-2 overflow-hidden rounded-[2rem] bg-[#c2410c] py-24 text-white [color-scheme:dark] sm:mx-3 sm:rounded-[3rem] sm:py-32"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,#ea580c,transparent_70%),radial-gradient(ellipse_70%_60%_at_100%_100%,#7a1f00,transparent_70%),radial-gradient(ellipse_60%_60%_at_100%_0%,#9a3412,transparent_70%)]"
      />
      <div className="mx-auto max-w-6xl px-6">
        <Signup />
      </div>
    </section>
  )
}

export function Landing() {
  const t = useTranslations("marketing")
  return (
    <Site>
      <main id="main-content">
        <Hero />
        <Section id="forecast" title={t("forecast.title")} text={t("forecast.text")}>
          <div className="relative isolate">
            <div
              aria-hidden
              className="absolute -inset-x-24 -inset-y-20 -z-10 bg-[radial-gradient(closest-side,rgb(255_122_46/0.13),transparent)]"
            />
            <Planner />
          </div>
        </Section>
        <Journey />
        <Island>
          <Section id="agents" title={t("agents.title")} text={t("agents.text")}>
            <Agents />
            <div className="mt-20 sm:mt-24">
              <Connect />
            </div>
          </Section>
        </Island>
        <Faq />
        <Closing />
      </main>
    </Site>
  )
}
