import { ArrowRight, Box } from "lucide-react"
import Link from "next/link"
import { BrandMark } from "@/components/auth/stage"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Bar } from "./bar"

// The marketing site's frame, shared by the home page and the contact page: its grounds and type treatments, the nav
// bar and the footer. The site is set on warm paper, with dark stages set into it.

// The two grounds: the paper, and the ink of the stages set into it.
export const paper = "light bg-(--paper) text-foreground [color-scheme:light]"
export const stage = "dark bg-(--ink) text-foreground [color-scheme:dark]"
// Copacker's orange, lit from above, as the ad's end card has it.
export const lit = "bg-[linear-gradient(180deg,#ffb27a_0%,#ff7a2e_45%,#f54a00_100%)] bg-clip-text text-transparent"
export const free = "Free to use, no credit card needed."
// Rises into place as the page loads, after its animation delay.
export const rise =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-[0.35em] motion-safe:duration-1000 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:fill-mode-both"

export function GetStarted({ className }: { className?: string }) {
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
  const sections = [
    ["/#forecast", "Forecast"],
    ["/#handoffs", "Handoffs"],
    ["/#agents", "Agents"],
    ["/#faq", "FAQ"]
  ]
  const link =
    "rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
  return (
    <Bar>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-10 px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <BrandMark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-foreground/60 md:flex">
          {sections.map(([href, label]) => (
            <a key={href} href={href} className={link}>
              {label}
            </a>
          ))}
          <Link href="/contact" className={link}>
            Contact
          </Link>
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

function Footer() {
  const columns = [
    {
      title: "Product",
      links: [
        ["/#forecast", "Forecast"],
        ["/#handoffs", "Handoffs"],
        ["/#agents", "Agents"],
        ["/#faq", "FAQ"]
      ]
    },
    {
      title: "Company",
      links: [
        ["/contact", "Contact"],
        ["/privacy", "Privacy"],
        ["/terms", "Terms"]
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
      {/* The three link groups stay side by side down to a phone, with the brand above them until there's room beside. */}
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-x-6 gap-y-12 px-6 pt-24 pb-12 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:gap-20">
        <div className="col-span-3 flex flex-col gap-5 md:col-span-1">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Box className="size-5" />
          </span>
          <p className="max-w-xs text-muted-foreground">Forecasting, purchase orders and logistics, in one place.</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3 text-sm">
            <span className="text-muted-foreground">{column.title}</span>
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
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-foreground/10 px-6 py-6 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} Copacker</span>
        <span>copacker.ai</span>
      </div>
    </footer>
  )
}

export function Site({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        paper,
        "relative min-h-svh overflow-x-clip [--ink:oklch(0.145_0_0)] [--paper:oklch(0.972_0.008_78)]"
      )}
    >
      <Nav />
      {children}
      <Footer />
    </div>
  )
}
