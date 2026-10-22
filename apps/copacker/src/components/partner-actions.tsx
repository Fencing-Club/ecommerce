import { CheckCircle2, CircleDashed, Clock, Ellipsis, MapPin, Pencil, Send } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { StatusBadge } from "@/components/common"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/components/ui/table"
import { useAction } from "@/hooks/use-action"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"
import { InviteForwarder, RemoveForwarder, RenameForwarder } from "./forwarder-actions"
import { isRowClick } from "./link-row"
import type { PartnerAddress } from "./partner-address"
import { PartnerAddressSheet } from "./partner-address"
import { EditSupplier, InviteSupplierByEmail } from "./supplier-actions"

// Where a partner stands with Copacker: on it, invited (the invitation may have run out), or not yet.
type Standing = { joined: boolean; invited: boolean; expired: boolean }

type Notice = { failed: boolean; text: string }

// Sends a partner's invitation again, to the email it went to before.
function useResend(action: "supplier.resend" | "forwarder.invite", id: string, email: string | null) {
  const t = useTranslations("partners.row")
  const [sent, setSent] = useState(false)
  const { run, pending, error } = useAction(action, { onSuccess: () => setSent(true) })
  let notice: Notice | null = null
  if (error) {
    notice = { failed: true, text: error }
  } else if (sent) {
    notice = { failed: false, text: email ? t("invitationSentTo", { email }) : t("invitationSent") }
  }
  function resend() {
    setSent(false)
    void run({ id })
  }
  return { resend, sending: pending, notice }
}

// A partner's row: its initials, name and contact line, where it stands, a detail, and a menu of its actions. A click
// anywhere on the row, or on the name, opens the partner.
function PartnerRow({
  name,
  contactLine,
  type,
  standing,
  sending,
  notice,
  detail,
  onOpen,
  menu,
  children
}: {
  name: string
  contactLine: string
  // Shown in the All tab, where both kinds of partner are listed.
  type: string | null
  standing: Standing
  sending: boolean
  notice: Notice | null
  detail: string
  onOpen: () => void
  menu: React.ReactNode
  // The dialogs the row and its menu open.
  children: React.ReactNode
}) {
  const t = useTranslations("partners.row")
  return (
    // On a phone the row stacks: the name and menu, then the status under the name.
    <TableRow
      className="cursor-pointer @max-md:flex @max-md:flex-wrap @max-md:items-center @max-md:gap-x-3 @max-md:gap-y-1 @max-md:px-4 @max-md:py-3"
      onClick={(event) => {
        if (isRowClick(event)) {
          onOpen()
        }
      }}
    >
      {/* Takes the room the other columns leave, and truncates to it, so a long contact line never pushes the other
          columns off the screen. */}
      <TableCell className="w-full max-w-0 ps-4 @max-md:w-auto @max-md:max-w-none @max-md:min-w-0 @max-md:flex-1 @max-md:p-0">
        <div className="flex items-center gap-3">
          <Avatar aria-hidden className="rounded-md after:rounded-md">
            <AvatarFallback className="rounded-md text-xs font-medium">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={onOpen}
              className="max-w-full truncate rounded-sm text-start font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {name}
            </button>
            {contactLine && <span className="truncate text-xs text-muted-foreground">{contactLine}</span>}
          </div>
        </div>
      </TableCell>
      {type && <TableCell className="hidden @2xl:table-cell">{type}</TableCell>}
      <TableCell className="@max-md:order-last @max-md:basis-full @max-md:p-0 @max-md:ps-11">
        <div className="flex flex-col items-start gap-1">
          <StandingBadge standing={standing} />
          {/* Says an invitation sent from the menu went, or why it didn't. */}
          <output className={cn("text-xs empty:hidden", notice?.failed ? "text-destructive" : "text-muted-foreground")}>
            {sending ? t("sending") : notice?.text}
          </output>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground @2xl:table-cell">{detail}</TableCell>
      <TableCell className="w-12 pe-4 text-end @max-md:w-auto @max-md:p-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={t("moreActions", { name })} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
        {children}
      </TableCell>
    </TableRow>
  )
}

// A status badge: joined is done, a live invitation is in progress, anything else is neutral.
function StandingBadge({ standing }: { standing: Standing }) {
  const t = useTranslations("partners.row.standing")
  if (standing.joined) {
    return (
      <StatusBadge tone="success" icon={<CheckCircle2 aria-hidden />}>
        {t("joined")}
      </StatusBadge>
    )
  }
  if (standing.invited && !standing.expired) {
    return (
      <StatusBadge tone="info" icon={<Clock aria-hidden />}>
        {t("invited")}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge tone="neutral" icon={<CircleDashed aria-hidden />}>
      {standing.invited ? t("expired") : t("notInvited")}
    </StatusBadge>
  )
}

// A supplier's row, which opens its details for editing, or its addresses for someone who can only view partners. Its
// menu opens its pickup addresses, which the buyer keeps for a supplier that hasn't joined, and invites such a supplier.
export function SupplierRow({
  supplier,
  editable,
  showType,
  defaultLeadTimeDays
}: {
  supplier: Standing & {
    id: string
    name: string
    // Where its invitation goes.
    email: string | null
    shopifySupplierName: string | null
    leadTimeDays: number | null
    contact: {
      website: string | null
      contactName: string | null
      contactEmail: string | null
      phoneNumber: string | null
    }
    addresses: PartnerAddress[]
  }
  // Whether the person can change partners, with Edit access to Partners.
  editable: boolean
  showType: boolean
  // The workspace lead time, for a supplier without its own.
  defaultLeadTimeDays: number
}) {
  const t = useTranslations("partners.row")
  const [open, setOpen] = useState<"edit" | "addresses" | "invite" | null>(null)
  const { resend, sending, notice } = useResend("supplier.resend", supplier.id, supplier.email)
  const invitable = editable && !supplier.joined
  const contactLine = [
    supplier.shopifySupplierName !== supplier.name && supplier.shopifySupplierName,
    supplier.contact.contactName,
    supplier.contact.contactEmail ?? supplier.email
  ]
    .filter(Boolean)
    .join(", ")
  const count = supplier.addresses.length
  const days = supplier.leadTimeDays ?? defaultLeadTimeDays
  return (
    <PartnerRow
      name={supplier.name}
      contactLine={contactLine}
      type={showType ? t("types.supplier") : null}
      standing={supplier}
      sending={sending}
      notice={notice}
      detail={count ? t("leadTimeAndAddresses", { days, count }) : t("leadTime", { days })}
      onOpen={() => setOpen(editable ? "edit" : "addresses")}
      menu={
        <>
          {editable && (
            <DropdownMenuItem onClick={() => setOpen("edit")}>
              <Pencil />
              {t("menu.edit")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpen("addresses")}>
            <MapPin />
            {t("menu.addresses")}
          </DropdownMenuItem>
          {invitable && <DropdownMenuSeparator />}
          {invitable && !supplier.invited && (
            <DropdownMenuItem onClick={() => setOpen("invite")}>
              <Send />
              {t("menu.invite")}
            </DropdownMenuItem>
          )}
          {invitable && supplier.invited && (
            <DropdownMenuItem disabled={sending} onClick={resend}>
              <Send />
              {t("menu.resend")}
            </DropdownMenuItem>
          )}
        </>
      }
    >
      {editable && (
        <EditSupplier
          id={supplier.id}
          name={supplier.name}
          shopifySupplierName={supplier.shopifySupplierName}
          leadTimeDays={supplier.leadTimeDays}
          defaultLeadTimeDays={defaultLeadTimeDays}
          contact={supplier.contact}
          joined={supplier.joined}
          open={open === "edit"}
          onOpenChange={(next) => setOpen(next ? "edit" : null)}
        />
      )}
      <PartnerAddressSheet
        partner={{ kind: "supplier", id: supplier.id, name: supplier.name }}
        joined={supplier.joined}
        editable={editable && !supplier.joined}
        addresses={supplier.addresses}
        open={open === "addresses"}
        onOpenChange={(next) => setOpen(next ? "addresses" : null)}
      />
      {invitable && (
        <InviteSupplierByEmail
          id={supplier.id}
          name={supplier.name}
          email={supplier.email}
          open={open === "invite"}
          onOpenChange={(next) => setOpen(next ? "invite" : null)}
        />
      )}
    </PartnerRow>
  )
}

// A forwarder's row, which opens its addresses. Someone who can change partners invites a forwarder that hasn't joined
// from its menu.
export function ForwarderRow({
  forwarder,
  editable,
  showType
}: {
  forwarder: Standing & { id: string; name: string; email: string | null; addresses: PartnerAddress[] }
  editable: boolean
  showType: boolean
}) {
  const t = useTranslations("partners.row")
  const [open, setOpen] = useState<"addresses" | "invite" | null>(null)
  const { resend, sending, notice } = useResend("forwarder.invite", forwarder.id, forwarder.email)
  const invitable = editable && !forwarder.joined
  const count = forwarder.addresses.length
  return (
    <PartnerRow
      name={forwarder.name}
      contactLine={forwarder.email ?? ""}
      type={showType ? t("types.forwarder") : null}
      standing={forwarder}
      sending={sending}
      notice={notice}
      detail={count ? t("addresses", { count }) : t("noAddresses")}
      onOpen={() => setOpen("addresses")}
      menu={
        <>
          <DropdownMenuItem onClick={() => setOpen("addresses")}>
            <MapPin />
            {t("menu.addresses")}
          </DropdownMenuItem>
          {invitable && <DropdownMenuSeparator />}
          {invitable && !forwarder.invited && (
            <DropdownMenuItem onClick={() => setOpen("invite")}>
              <Send />
              {t("menu.invite")}
            </DropdownMenuItem>
          )}
          {invitable && forwarder.invited && (
            <DropdownMenuItem disabled={sending} onClick={resend}>
              <Send />
              {t("menu.resend")}
            </DropdownMenuItem>
          )}
        </>
      }
    >
      <PartnerAddressSheet
        partner={{ kind: "forwarder", id: forwarder.id, name: forwarder.name }}
        joined={forwarder.joined}
        editable={editable && !forwarder.joined}
        addresses={forwarder.addresses}
        open={open === "addresses"}
        onOpenChange={(next) => setOpen(next ? "addresses" : null)}
      >
        {editable && (
          <>
            <RenameForwarder id={forwarder.id} name={forwarder.name} />
            <RemoveForwarder id={forwarder.id} name={forwarder.name} />
          </>
        )}
      </PartnerAddressSheet>
      {invitable && (
        <InviteForwarder
          id={forwarder.id}
          name={forwarder.name}
          email={forwarder.email}
          open={open === "invite"}
          onOpenChange={(next) => setOpen(next ? "invite" : null)}
        />
      )}
    </PartnerRow>
  )
}
