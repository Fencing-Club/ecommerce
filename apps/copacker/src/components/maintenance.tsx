import { Wrench } from "lucide-react"
import { useTranslations } from "use-intl"
import { BrandMark } from "@/components/auth/stage"
import { DotField } from "@/components/marketing/dot-field"
import { lift, lit, rise, stage } from "@/components/marketing/site-styles"
import { ReloadWhenBack } from "@/components/reload-when-back"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A wrench in a pane of glass, lit from behind in Copacker's orange, with a light going round it while the work goes on.
function Emblem() {
  return (
    <div aria-hidden className={cn("relative flex size-44 items-center justify-center", rise)}>
      <div className="absolute -inset-16 rounded-full bg-[radial-gradient(closest-side,rgb(255_122_46/0.3),rgb(255_122_46/0.08)_60%,transparent)]" />
      <div className="absolute inset-0 rounded-full ring-1 ring-white/[0.08]" />
      <div className="absolute inset-6 rounded-full ring-1 ring-white/[0.05]" />
      <div className="absolute inset-0 motion-safe:animate-spin motion-safe:[animation-duration:5s]">
        <div className="absolute inset-0 rounded-full bg-[conic-gradient(transparent_0deg,transparent_190deg,rgb(255_140_60/0.95)_360deg)] [mask-image:radial-gradient(farthest-side,transparent_calc(100%_-_1.5px),black_calc(100%_-_1px))]" />
        <div className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-orange-100 shadow-[0_0_12px_3px_rgb(255_140_60/0.8)]" />
      </div>
      <div className="relative flex size-20 items-center justify-center rounded-3xl bg-[linear-gradient(180deg,oklch(0.27_0.014_55),oklch(0.2_0.01_55))] shadow-[0_28px_56px_-16px_rgb(0_0_0/0.85),0_0_40px_-8px_rgb(255_122_46/0.35),inset_0_1px_0_rgb(255_255_255/0.1)] ring-1 ring-white/[0.12]">
        <Wrench className="size-8 text-orange-300 drop-shadow-[0_0_10px_rgb(255_140_60/0.55)]" strokeWidth={1.75} />
      </div>
    </div>
  )
}

// The heading's last words, in Copacker's orange, lit from above.
const accent = (chunks: React.ReactNode) => <span className={lit}>{chunks}</span>

// What every page behind sign-in shows while Copacker is down for maintenance, on the dark stage the marketing page
// opens with. It reloads into the page it stands in for once Copacker is back.
export function Maintenance() {
  const t = useTranslations("common.pages.maintenance")
  return (
    <div
      className={cn(stage, "relative isolate flex min-h-svh flex-col overflow-hidden [--ink:oklch(0.145_0_0)]")}
      data-tone="dark"
    >
      <div aria-hidden className="absolute inset-0 -z-10">
        <DotField
          settled
          className="[mask-image:radial-gradient(ellipse_75%_65%_at_50%_45%,black_20%,transparent_80%)]"
        />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-[radial-gradient(ellipse_55%_70%_at_50%_100%,rgb(255_122_46/0.26),rgb(255_122_46/0.07)_55%,transparent)]" />
      </div>
      <header className="flex h-16 shrink-0 items-center px-6">
        <a href="/" className="focus-ring rounded-md">
          <BrandMark />
        </a>
      </header>
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-6 pt-6 pb-24 text-center">
        <Emblem />
        <div className="relative mt-10 flex flex-col items-center">
          {/* A soft, wide shade behind the words, as the marketing hero has, so they read clearly over the points. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-48 -inset-y-28 -z-10 bg-[radial-gradient(closest-side,oklch(0.145_0_0/0.65),oklch(0.145_0_0/0.5)_35%,oklch(0.145_0_0/0.25)_65%,oklch(0.145_0_0/0.08)_85%,transparent)]"
          />
          <p
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[0.8125rem] font-medium text-white/80 ring-1 ring-white/10 backdrop-blur-sm",
              rise
            )}
            style={{ animationDelay: "120ms" }}
          >
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-orange-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-orange-400" />
            </span>
            {t("status")}
          </p>
          <h1
            className={cn(
              "mt-6 max-w-3xl text-[clamp(2.75rem,7vw,5rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-balance",
              lift
            )}
            style={{ animationDelay: "220ms" }}
          >
            {t.rich("heading", { accent })}
          </h1>
          <p
            className={cn("mt-6 max-w-lg text-lg text-pretty text-white/65", rise)}
            style={{ animationDelay: "360ms" }}
          >
            {t("text")}
          </p>
          <Button
            variant="outline"
            size="lg"
            className={cn("mt-10 h-11 rounded-xl px-5 text-[0.9375rem]", rise)}
            style={{ animationDelay: "480ms" }}
            nativeButton={false}
            render={<a href="/contact" aria-label={t("contact")} />}
          >
            {t("contact")}
          </Button>
        </div>
      </main>
      <ReloadWhenBack />
    </div>
  )
}
