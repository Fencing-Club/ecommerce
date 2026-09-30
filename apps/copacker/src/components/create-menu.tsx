"use client"

import { ClipboardList, FileUp, Plus, Tag, Truck, Upload, UserPlus, BookOpen, type LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePermissions } from "@/components/access"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { type Area, can } from "@/lib/access"

// What each kind can create, each needing Edit on its page. Labels are keys under the "navigation" messages' `create`.
const actions = {
  buyer: [
    { key: "purchaseOrder", href: "/orders/new", area: "orders", icon: ClipboardList },
    { key: "importPurchaseOrder", href: "/orders/import", area: "orders", icon: FileUp },
    { key: "supplier", href: "/partners?add=supplier", area: "partners", icon: UserPlus },
    { key: "forwarder", href: "/partners?add=forwarder", area: "partners", icon: Truck }
  ],
  supplier: [
    { key: "product", href: "/products/new", area: "products", icon: Tag },
    { key: "catalog", href: "/catalogs/new", area: "catalogs", icon: BookOpen },
    { key: "importProducts", href: "/products?import=true", area: "products", icon: Upload }
  ]
} as const satisfies Record<string, ReadonlyArray<{ key: string; href: string; area: Area; icon: LucideIcon }>>

function actionsFor(kind: string) {
  return kind === "buyer" || kind === "supplier" ? actions[kind] : []
}

// The top bar's Create button, with the workspace kind's create actions the person can take. A forwarder creates
// nothing, and someone who can't edit any of them doesn't see it.
export function CreateMenu({ kind }: { kind: string }) {
  const t = useTranslations("navigation.create")
  const permissions = usePermissions()
  const allowed = actionsFor(kind).filter((action) => can(permissions, action.area, "edit"))
  if (!allowed.length) {
    return null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted">
        <Plus className="size-4" aria-hidden />
        {t("button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {allowed.map((action) => (
          <DropdownMenuItem key={action.key} render={<Link href={action.href} />}>
            <action.icon />
            {t(action.key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
