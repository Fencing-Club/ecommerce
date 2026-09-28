import { ArrowRight, Box } from "lucide-react"
import Link from "next/link"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Agents } from "./agents"
import { Bar } from "./bar"
import { DotField } from "./dot-field"
import { Film } from "./film"
import { Journey } from "./journey"
import { RestockShot } from "./mockups"
import { Planner } from "./planner"
import { Scaled } from "./scaled"
import { Tilt } from "./tilt"

// The marketing page anyone signed out sees at /. It's set on warm paper, with dark stages set into it: the hero, where
// the mess a restock makes settles into order, and the diagrams of the handoffs and agents. The product shots are the
// app's own components with demo data (./mockups). There are no paid plans yet, so it asks only for a sign-up.

// Copacker's orange, lit from above, as the ad's end card has it.
const lit = "bg-[linear-gradient(180deg,#ffb27a_0%,#ff7a2e_45%,#f54a00_100%)] bg-clip-text text-transparent"
const free = "Free to use, no credit card needed."
const rise =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"
// The page's two grounds: the paper, and the ink of the stages set into it.
const paper = "light bg-(--paper) text-foreground [color-scheme:light]"
const stage = "dark bg-(--ink) text-foreground [color-scheme:dark]"

function GetStarted({ className }: { className?: string }) {
  return (
    <Button
      size="lg"
      className={cn("h-11 gap-2 rounded-xl px-5 text-[0.9375rem]", className)}
      nativeButton={false}
      render={<Link href="/signup" />}
    >
      Get started
      <ArrowRight />
    </Button>
  )
}

function Nav() {
  const links = [
    ["#forecast", "Forecast"],
    ["#handoffs", "Handoffs"],
    ["#agents", "Agents"],
    ["#faq", "FAQ"]
  ]
  return (
    <Bar>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-foreground/60 md:flex">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button nativeButton={false} render={<Link href="/signup" />}>
            Get started
          </Button>
        </div>
      </div>
    </Bar>
  )
}

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

// The hero's stage ends partway down the product shot, which carries on over the paper below. The shot's overhang is a
// share of its width, as margins and padding in percent are, so the space kept for it below matches at any size.
function Hero() {
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
            <span className={cn("inline-block", rise)} style={{ animationDelay: "150ms" }}>
              Restocking,
            </span>{" "}
            <span className={cn("inline-block", rise, lit)} style={{ animationDelay: "320ms" }}>
              handled.
            </span>
          </h1>
          <p
            className={cn("mt-8 max-w-2xl text-lg text-pretty text-white/65 sm:text-xl", rise)}
            style={{ animationDelay: "520ms" }}
          >
            Copacker forecasts what to reorder from your Amazon, Shopify and eBay sales, then sends the purchase order
            and ships it to Amazon.
          </p>
          <div
            className={cn("mt-10 flex flex-wrap items-center justify-center gap-3", rise)}
            style={{ animationDelay: "680ms" }}
          >
            <GetStarted />
            <Film />
          </div>
          <p className={cn("mt-4 text-sm text-white/40", rise)} style={{ animationDelay: "800ms" }}>
            {free}
          </p>
        </div>
        <div className={cn("mx-auto max-w-6xl px-6 pt-20 sm:pt-24", rise)} style={{ animationDelay: "900ms" }}>
          <div className="-mb-[27%]">
            <Tilt>
              <Shot
                width={1280}
                height={800}
                caption="Copacker’s Restock page: two products from Shenzhen Metalworks to reorder, with order quantities, a $15,090 estimated cost, and about $18,340 in sales at risk before reorders arrive."
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
        <p className="text-lg text-pretty text-muted-foreground">{text}</p>
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

function Faq() {
  const questions = [
    ["What does Copacker cost?", "Nothing right now. There are no paid plans, and signing up doesn’t ask for a card."],
    ["Which stores does it work with?", "Amazon, Shopify and eBay. Copacker reads your sales and stock from each."],
    [
      "Does it ship to AWD?",
      "Yes. Copacker plans shipments to FBA and AWD, including AWD warehouses in China and Vietnam."
    ],
    [
      "What’s MCP?",
      "The Model Context Protocol, an open standard for connecting AI agents to apps. Copacker’s MCP server lets your agents work in your workspace."
    ]
  ]
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-28 sm:py-36">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <h2
          id="faq-title"
          className="text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.04em]"
        >
          Questions
        </h2>
        <dl className="border-t border-foreground/10">
          {questions.map(([question, answer]) => (
            <div
              key={question}
              className="grid gap-2 border-b border-foreground/10 py-7 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-10"
            >
              <dt className="text-lg font-medium">{question}</dt>
              <dd className="text-muted-foreground">{answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section
      data-tone="dark"
      className="dark relative isolate mx-2 overflow-hidden rounded-[2rem] bg-[#f54a00] px-6 py-32 text-center text-white [color-scheme:dark] sm:mx-3 sm:rounded-[3rem] sm:py-44"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,#ffb27a,transparent_70%),radial-gradient(ellipse_70%_60%_at_100%_100%,#7a1f00,transparent_70%),radial-gradient(ellipse_60%_60%_at_0%_100%,#c2410c,transparent_70%)]"
      />
      <h2 className="text-[clamp(3rem,8vw,6rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance">
        Restocking, handled.
      </h2>
      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <GetStarted className="bg-white text-[#1c1917] hover:bg-white/90" />
        <Film />
      </div>
      <p className="mt-4 text-sm text-white/70">{free}</p>
    </section>
  )
}

function Footer() {
  const columns = [
    {
      title: "Product",
      links: [
        ["#forecast", "Forecast"],
        ["#handoffs", "Handoffs"],
        ["#agents", "Agents"],
        ["#faq", "FAQ"]
      ]
    },
    {
      title: "Account",
      links: [
        ["/signup", "Get started"],
        ["/login", "Sign in"]
      ]
    }
  ]
  return (
    <footer className={paper}>
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-24 pb-12 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-24">
        <div className="flex flex-col gap-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Box className="size-5" />
          </span>
          <p className="max-w-xs text-muted-foreground">
            Forecasting, purchase orders and Amazon shipments, in one place.
          </p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3 text-sm">
            <span className="text-muted-foreground">{column.title}</span>
            {column.links.map(([href, label]) =>
              href?.startsWith("#") ? (
                <a key={href} href={href} className="w-fit text-foreground/80 hover:text-foreground">
                  {label}
                </a>
              ) : (
                <Link key={href} href={href ?? "/"} className="w-fit text-foreground/80 hover:text-foreground">
                  {label}
                </Link>
              )
            )}
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-foreground/10 px-6 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Copacker</span>
        <span>copacker.ai</span>
      </div>
    </footer>
  )
}

export function Landing() {
  return (
    <div
      className={cn(
        paper,
        "relative min-h-svh overflow-x-clip [--ink:oklch(0.145_0_0)] [--paper:oklch(0.972_0.008_78)]"
      )}
    >
      <Nav />
      <main id="main-content">
        <Hero />
        <Section
          id="forecast"
          title="Know when to reorder."
          text="Copacker forecasts every product from your Amazon, Shopify and eBay sales, and works back from your supplier’s lead time to the day you need to order."
        >
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
          <Section
            id="agents"
            title="Built for AI agents."
            text="Copacker connects to your agents over MCP, so they can plan, order and ship right alongside you. Your partners’ agents post their updates too."
          >
            <Agents />
          </Section>
        </Island>
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
