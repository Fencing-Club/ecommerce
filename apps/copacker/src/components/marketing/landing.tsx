import { ArrowRight, Box } from "lucide-react"
import Link from "next/link"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Agents } from "./agents"
import { DotField } from "./dot-field"
import { Film } from "./film"
import { Flow } from "./flow"
import { Forecast } from "./forecast"
import { HandoffShot, PurchaseOrderShot, RestockShot, ShipmentsShot } from "./mockups"
import { Scaled } from "./scaled"
import { Statement } from "./statement"
import { Story } from "./story"

// The marketing page anyone signed out sees at /, told the way the ad tells it: the mess a restock makes settling into
// order, the stockout seen coming and headed off, the handoffs, the agents, and the app itself. The product shots are
// the app's own components with demo data (./mockups). There are no paid plans yet, so it asks only for a sign-up.

// Copacker's orange, lit from above, as the ad's end card has it.
const lit = "bg-[linear-gradient(180deg,#ffb27a_0%,#ff7a2e_45%,#f54a00_100%)] bg-clip-text text-transparent"
const free = "Free to use, no credit card needed."
const rise =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"

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
    <header className="sticky top-0 z-40 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-white/60 md:flex">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-sm transition-colors outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50"
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
    </header>
  )
}

// A product shot: the app window floating over the stage. The caption is for screen readers.
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
      <div className="overflow-hidden rounded-xl shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_50px_100px_-30px_rgb(0_0_0/0.85)]">
        <Scaled width={width} height={height}>
          {children}
        </Scaled>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  )
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <DotField className="-z-10 [mask-image:linear-gradient(to_bottom,black_45%,transparent_92%)]" />
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-28 text-center sm:pt-36">
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
          Copacker forecasts what to reorder from your Amazon, Shopify and eBay sales, then sends the purchase order and
          ships it to Amazon.
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
      <div
        className={cn("mx-auto mt-20 max-w-6xl px-6 [perspective:2400px] sm:mt-24", rise)}
        style={{ animationDelay: "900ms" }}
      >
        <Shot
          width={1280}
          height={800}
          className="origin-top [mask-image:linear-gradient(to_bottom,black_60%,transparent)] lg:[transform:rotateX(9deg)]"
          caption="Copacker’s Restock page: two products from Shenzhen Metalworks to reorder, with order quantities, a $15,090 estimated cost, and about $18,340 in sales at risk before reorders arrive."
        >
          <RestockShot />
        </Shot>
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
        <p className="text-lg text-pretty text-white/60">{text}</p>
      </div>
      <div className="mt-16 sm:mt-20">{children}</div>
    </section>
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
        <dl className="border-t border-white/10">
          {questions.map(([question, answer]) => (
            <div
              key={question}
              className="grid gap-2 border-b border-white/10 py-7 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-10"
            >
              <dt className="text-lg font-medium">{question}</dt>
              <dd className="text-white/60">{answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="relative isolate overflow-hidden px-6 py-36 text-center sm:py-48">
      <DotField settled className="-z-10 [mask-image:radial-gradient(ellipse_60%_70%_at_50%_60%,black,transparent)]" />
      <h2 className="text-[clamp(3rem,8vw,6rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance">
        Restocking, <span className={lit}>handled.</span>
      </h2>
      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <GetStarted />
        <Film />
      </div>
      <p className="mt-4 text-sm text-white/40">{free}</p>
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
    <footer className="bg-[oklch(0.12_0.004_285)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pt-20 pb-12 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-24">
        <div className="flex flex-col gap-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Box className="size-5" />
          </span>
          <p className="max-w-xs text-white/50">Forecasting, purchase orders and Amazon shipments, in one place.</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3 text-sm">
            <span className="text-white/40">{column.title}</span>
            {column.links.map(([href, label]) =>
              href?.startsWith("#") ? (
                <a key={href} href={href} className="w-fit text-white/75 hover:text-white">
                  {label}
                </a>
              ) : (
                <Link key={href} href={href ?? "/"} className="w-fit text-white/75 hover:text-white">
                  {label}
                </Link>
              )
            )}
          </nav>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-white/[0.07] px-6 py-6 text-xs text-white/35">
        <span>© {new Date().getFullYear()} Copacker</span>
        <span>copacker.ai</span>
      </div>
    </footer>
  )
}

export function Landing() {
  return (
    <div className="dark relative min-h-svh overflow-x-clip bg-background text-foreground [color-scheme:dark]">
      <Nav />
      <main id="main-content">
        <Hero />
        <Statement />
        <Forecast />
        <Section
          id="handoffs"
          title="Every handoff, in one place."
          text="Your supplier, your forwarder and Amazon’s warehouses all work from the same purchase order. Copacker books the inbound shipments, prints the box labels, and splits stock between FBA and AWD, down to warehouses in China and Vietnam."
        >
          <Flow />
        </Section>
        <Section
          id="agents"
          title="Built for AI agents."
          text="Copacker connects to your agents over MCP, so they can plan, order and ship right alongside you. Your partners’ agents post their updates too."
        >
          <Agents />
        </Section>
        <Story
          chapters={[
            {
              title: "Reorder in one click.",
              text: "Pick what Restock says to order, and Copacker writes the purchase order. Your supplier fills in the packing list right on it.",
              screen: (
                <Shot
                  width={1100}
                  height={540}
                  caption="A purchase order in Copacker: PO 1043 with Shenzhen Metalworks, bound for Amazon AWD, with 2,520 steel bottles and 660 mugs totaling $13,650."
                >
                  <PurchaseOrderShot />
                </Shot>
              )
            },
            {
              title: "Labels and shipments, done for you.",
              text: "Copacker creates Amazon’s inbound shipments and prints a box label for every carton.",
              screen: (
                <Shot
                  width={1100}
                  height={520}
                  caption="Copacker’s Shipments page: Amazon inbound shipments to FBA, AWD in the US and AWD in China, with their cartons and status."
                >
                  <ShipmentsShot />
                </Shot>
              )
            },
            {
              title: "The whole story on every order.",
              text: "Comments, updates and documents from every partner, on one timeline.",
              screen: (
                <Shot
                  width={1000}
                  height={420}
                  caption="A purchase order’s timeline in Copacker: the supplier’s comment and updates, the forwarder’s shipment, and every document on the order."
                >
                  <HandoffShot />
                </Shot>
              )
            }
          ]}
        />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  )
}
