import { countryName } from "@repo/copacker-shipments/countries"
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Box,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  PackagePlus,
  Receipt,
  Settings,
  Tag,
  Truck,
  Users,
  Warehouse
} from "lucide-react"
import { useWatch } from "react-hook-form"
import { useLocale, useTranslations } from "use-intl"
import type { Messages } from "@/i18n/messages"
import { initials } from "@/lib/initials"
import type { WorkspaceKind } from "@/lib/onboarding"
import { isPosition, positionKeys } from "@/lib/onboarding"
import { cn } from "@/lib/utils"
import type { WizardStep } from "./wizard-steps"

type PageKey = keyof Messages["onboarding"]["preview"]["pages"]
type GroupKey = keyof Messages["onboarding"]["preview"]["groups"]
type Page = { label: PageKey; icon: LucideIcon }

// A sketch of each kind's pages in the sidebar, in its groups; Settings sits apart at the bottom. It shows what a kind
// of workspace is for, so it doesn't follow every change to the live navigation.
const pages: Record<WorkspaceKind, Array<{ label: GroupKey | null; pages: Page[] }>> = {
  buyer: [
    {
      label: "store",
      pages: [
        { label: "overview", icon: LayoutDashboard },
        { label: "orders", icon: Receipt },
        { label: "products", icon: Box },
        { label: "restock", icon: PackagePlus }
      ]
    },
    {
      label: "purchasing",
      pages: [
        { label: "purchaseOrders", icon: ClipboardList },
        { label: "shipments", icon: Truck }
      ]
    }
  ],
  supplier: [
    { label: null, pages: [{ label: "overview", icon: LayoutDashboard }] },
    {
      label: "sales",
      pages: [
        { label: "orders", icon: ClipboardList },
        { label: "shipments", icon: Truck },
        { label: "customers", icon: Users }
      ]
    },
    {
      label: "products",
      pages: [
        { label: "products", icon: Tag },
        { label: "inventory", icon: Warehouse },
        { label: "catalogs", icon: BookOpen }
      ]
    }
  ],
  forwarder: [{ label: "purchasing", pages: [{ label: "purchaseOrders", icon: ClipboardList }] }]
}

// Settings, apart at the bottom of every kind's sidebar.
const settingsGroup: { label: GroupKey | null; pages: Page[] } = {
  label: null,
  pages: [{ label: "settings", icon: Settings }]
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")

// A bar where text will be, until it's typed.
function Placeholder({ className }: { className: string }) {
  return <span className={cn("block h-2 rounded-full bg-muted-foreground/15", className)} />
}

// The part of the preview the current step fills in: outlined in the brand color.
function Spot({ on, className, children }: { on: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-lg transition-[box-shadow,background-color] duration-500",
        on && "bg-primary/[0.06] shadow-[0_0_0_2px_var(--color-primary)]",
        className
      )}
    >
      {children}
    </div>
  )
}

// The workspace taking shape as someone gets started: the portal in miniature, with their company, their role's pages,
// their name and their first address. Decorative; the form beside it says everything it shows.
export function WorkspacePreview({ step, kind }: { step: WizardStep; kind: WorkspaceKind | "" }) {
  const t = useTranslations("onboarding")
  const locale = useLocale()
  const values = useWatch()
  const person = values.person ?? {}
  const name = [text(person.firstName), text(person.lastName)].filter(Boolean).join(" ")
  const company = text(values.company?.name)
  const place = values.address ?? {}
  const address = place.address ?? {}
  const street = text(address.addressLine1)
  const city = [text(address.city), text(address.stateOrRegion), text(address.postalCode)].filter(Boolean).join(", ")
  const country = countryName(text(address.countryCode), locale) ?? ""
  const typedPosition = text(person.position)
  const positionLabel = isPosition(typedPosition) ? t(`positions.${positionKeys[typedPosition]}`) : typedPosition
  const groups = kind ? pages[kind] : []
  const page = groups[0]?.pages[0]?.label ?? "overview"
  return (
    <div
      aria-hidden
      className="w-full max-w-[34rem] overflow-hidden rounded-2xl bg-background text-foreground shadow-[0_40px_80px_-24px_rgb(0_0_0/0.75)] ring-1 ring-white/15 select-none"
    >
      <div className="flex h-10 items-center gap-2 border-b px-3.5">
        <span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Box className="size-3" />
        </span>
        <span className="text-xs font-semibold tracking-tight">Copacker</span>
        <span className="mx-auto h-5 w-40 rounded-md bg-muted" />
        <span className="size-5" />
      </div>
      <div className="grid h-[25rem] grid-cols-[10.5rem_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3 border-e bg-sidebar p-2 text-[11px]">
          <Spot on={step === "company" || step === "role"} className="p-1.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-[10px] font-medium">
                {initials(company) || <Placeholder className="w-3" />}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                {company ? <span className="truncate font-medium">{company}</span> : <Placeholder className="w-16" />}
                <span className="truncate text-[10px] text-muted-foreground">
                  {kind ? t(`preview.kinds.${kind}`) : t("preview.workspace")}
                </span>
              </span>
            </div>
          </Spot>
          <Spot on={step === "role"} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-1.5">
            {kind
              ? [...groups, settingsGroup].map((group, position, all) => (
                  <div
                    key={group.pages[0]?.label}
                    className={cn("flex flex-col gap-0.5", position === all.length - 1 && "mt-auto")}
                  >
                    {group.label && (
                      <span className="px-1.5 pb-0.5 text-[10px] text-muted-foreground">
                        {t(`preview.groups.${group.label}`)}
                      </span>
                    )}
                    {group.pages.map((item, index) => (
                      <span
                        key={item.label}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-1.5 py-[3px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-start-1 motion-safe:fill-mode-both",
                          item.label === page && position === 0 && index === 0 && "bg-sidebar-accent font-medium"
                        )}
                        style={{ animationDelay: `${index * 40}ms` }}
                      >
                        <item.icon className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{t(`preview.pages.${item.label}`)}</span>
                      </span>
                    ))}
                  </div>
                ))
              : [16, 20, 14, 18].map((width) => (
                  <span key={width} className="flex items-center gap-2 px-1.5 py-1">
                    <span className="size-3 rounded bg-muted-foreground/15" />
                    <Placeholder className="flex-1" />
                  </span>
                ))}
          </Spot>
          <Spot on={step === "about"} className="p-1.5">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                {initials(name) || <Placeholder className="w-3" />}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                {name ? <span className="truncate font-medium">{name}</span> : <Placeholder className="w-16" />}
                {positionLabel ? (
                  <span className="truncate text-[10px] text-muted-foreground">{positionLabel}</span>
                ) : (
                  <Placeholder className="w-10" />
                )}
              </span>
            </div>
          </Spot>
        </div>
        <div className="flex min-w-0 flex-col gap-4 p-4">
          <span className="text-sm font-semibold tracking-tight">
            {kind ? t(`preview.pages.${page}`) : <Placeholder className="w-24" />}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((tile) => (
              <div key={tile} className="flex flex-col gap-2 rounded-lg border p-2.5">
                <Placeholder className="w-10" />
                <span className="block h-3 w-12 rounded-full bg-muted-foreground/25" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-lg border p-2.5">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Placeholder className="flex-1" />
                <Placeholder className="w-8" />
              </div>
            ))}
          </div>
          <Spot on={step === "address"} className="mt-auto">
            <div className="flex items-start gap-2.5 rounded-lg border bg-background p-2.5 text-[11px]">
              <MapPin className="mt-px size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">
                  {kind ? t(`steps.address.${kind}.title`) : t("preview.address")}
                </span>
                {text(place.name) ? (
                  <span className="truncate font-medium">{text(place.name)}</span>
                ) : (
                  <Placeholder className="w-20" />
                )}
                {street || city || country ? (
                  <span className="truncate text-muted-foreground">
                    {[street, city, country].filter(Boolean).join(", ")}
                  </span>
                ) : (
                  <Placeholder className="w-32" />
                )}
              </div>
            </div>
          </Spot>
        </div>
      </div>
    </div>
  )
}
