import type { LucideIcon } from "lucide-react"
import { ClipboardList, FileUp, Plus, Tag, Upload, BookOpen } from "lucide-react"
import { useTranslations } from "use-intl"
import { usePermissions } from "@/components/access"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { Area } from "@/lib/access"
import { can } from "@/lib/access"

// What each kind can create, each needing Edit on its page. Labels are keys under the "navigation" messages' `create`.
const actions = {
  buyer: [
    { key: "purchaseOrder", href: "/orders/new", area: "orders", icon: ClipboardList },
    { key: "importPurchaseOrder", href: "/orders/import", area: "orders", icon: FileUp }
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
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Plus data-icon="inline-start" aria-hidden />
        {t("button")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {allowed.map((action) => (
          <DropdownMenuItem key={action.key} render={<a href={action.href} aria-label={t(action.key)} />}>
            <action.icon />
            {t(action.key)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
