"use client"

import { ChevronDown, Plus } from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { useTranslations } from "use-intl"
import { AddForwarder } from "./add-forwarder"
import { InviteSupplier } from "./invite-supplier"
import { Button } from "./ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

// One button for adding either kind of partner. `?add=supplier` or `?add=forwarder` opens its dialog, so the top bar's
// Create menu can link straight to it.
export function AddPartner({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("partners.add")
  const [adding, setAdding] = useQueryState("add", parseAsStringLiteral(["supplier", "forwarder"]))
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          {t("button")}
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => void setAdding("supplier")}>{t("supplier")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void setAdding("forwarder")}>{t("forwarder")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InviteSupplier
        onCreated={onCreated}
        open={adding === "supplier"}
        onOpenChange={(open) => void setAdding(open ? "supplier" : null)}
      />
      <AddForwarder
        onCreated={onCreated}
        open={adding === "forwarder"}
        onOpenChange={(open) => void setAdding(open ? "forwarder" : null)}
      />
    </>
  )
}
