"use client"

import { CheckCircle2, ChevronDown, CircleDashed, Clock, Ellipsis, MapPin, Pencil, Plus, Send } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TableCell, TableRow } from "@/components/ui/table"
import { errorMessage, useActionMutation } from "@/lib/api"
import { cn } from "@/lib/utils"
import { AddForwarder, InviteForwarder, RemoveForwarder, RenameForwarder } from "./forwarder-actions"
import { isRowClick } from "./link-row"
import { type PartnerAddress, PartnerAddressSheet } from "./partner-address"
import { EditSupplier, InviteSupplier, InviteSupplierByEmail } from "./supplier-actions"

// One button for adding either kind of partner.
export function AddPartner() {
  const [adding, setAdding] = useState<"supplier" | "forwarder" | null>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button />}>
          <Plus data-icon="inline-start" />
          Add partner
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setAdding("supplier")}>Supplier</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAdding("forwarder")}>Freight forwarder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <InviteSupplier open={adding === "supplier"} onOpenChange={(open) => setAdding(open ? "supplier" : null)} />
      <AddForwarder open={adding === "forwarder"} onOpenChange={(open) => setAdding(open ? "forwarder" : null)} />
    </>
  )
}

// Where a partner stands with Copacker: on it, invited (the invitation may have run out), or not yet.
type Standing = { joined: boolean; invited: boolean; expired: boolean }

type Notice = { failed: boolean; text: string }

// "1 address", "2 addresses"
function addressCount(count: number) {
  return `${count} ${count === 1 ? "address" : "addresses"}`
}

// "Shenzhen Tongzhi Logistics" as "ST".
function initials(name: string) {
  return name
    .split(/\s+/)
    .flatMap((word) => Array.from(word.replace(/[^\p{L}\p{N}]/gu, "")).slice(0, 1))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// Sends a partner's invitation again, to the email it went to before.
function useResend(action: "supplier.resend" | "forwarder.invite", id: string, email: string | null) {
  const router = useRouter()
  const [run, { isLoading }] = useActionMutation()
  const [notice, setNotice] = useState<Notice | null>(null)
  async function resend() {
    setNotice(null)
    try {
      await run({ action, data: { id } }).unwrap()
      setNotice({ failed: false, text: email ? `Invitation sent to ${email}` : "Invitation sent" })
      router.refresh()
    } catch (error) {
      setNotice({ failed: true, text: errorMessage(error) })
    }
  }
  return { resend, sending: isLoading, notice }
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
  return (
    <TableRow
      className="cursor-pointer"
      onClick={(event) => {
        if (isRowClick(event)) {
          onOpen()
        }
      }}
    >
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          <Avatar aria-hidden className="rounded-md after:rounded-md">
            <AvatarFallback className="rounded-md text-xs font-medium">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={onOpen}
              className="w-fit rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {name}
            </button>
            {contactLine && <span className="text-xs text-muted-foreground">{contactLine}</span>}
          </div>
        </div>
      </TableCell>
      {type && <TableCell className="hidden @2xl:table-cell">{type}</TableCell>}
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <StandingBadge standing={standing} />
          {/* Says an invitation sent from the menu went, or why it didn't. */}
          <output className={cn("text-xs empty:hidden", notice?.failed ? "text-destructive" : "text-muted-foreground")}>
            {sending ? "Sending…" : notice?.text}
          </output>
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground @2xl:table-cell">{detail}</TableCell>
      <TableCell className="w-12 pr-4 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${name}`} />}
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

// In the Status badge's styles: joined is done, a live invitation is in progress, anything else is neutral.
function StandingBadge({ standing }: { standing: Standing }) {
  if (standing.joined) {
    return (
      <Badge variant="outline">
        <CheckCircle2 data-icon="inline-start" />
        On Copacker
      </Badge>
    )
  }
  if (standing.invited && !standing.expired) {
    return (
      <Badge variant="secondary">
        <Clock data-icon="inline-start" />
        Invited
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      <CircleDashed data-icon="inline-start" />
      {standing.invited ? "Invitation expired" : "Not invited"}
    </Badge>
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
  const leadTime = `Lead time ${supplier.leadTimeDays ?? defaultLeadTimeDays} days`
  return (
    <PartnerRow
      name={supplier.name}
      contactLine={contactLine}
      type={showType ? "Supplier" : null}
      standing={supplier}
      sending={sending}
      notice={notice}
      detail={count ? `${leadTime}, ${addressCount(count)}` : leadTime}
      onOpen={() => setOpen(editable ? "edit" : "addresses")}
      menu={
        <>
          {editable && (
            <DropdownMenuItem onClick={() => setOpen("edit")}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setOpen("addresses")}>
            <MapPin />
            Addresses
          </DropdownMenuItem>
          {invitable && <DropdownMenuSeparator />}
          {invitable && !supplier.invited && (
            <DropdownMenuItem onClick={() => setOpen("invite")}>
              <Send />
              Invite
            </DropdownMenuItem>
          )}
          {invitable && supplier.invited && (
            <DropdownMenuItem disabled={sending} onClick={() => void resend()}>
              <Send />
              Resend invitation
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
  const [open, setOpen] = useState<"addresses" | "invite" | null>(null)
  const { resend, sending, notice } = useResend("forwarder.invite", forwarder.id, forwarder.email)
  const invitable = editable && !forwarder.joined
  const count = forwarder.addresses.length
  return (
    <PartnerRow
      name={forwarder.name}
      contactLine={forwarder.email ?? ""}
      type={showType ? "Freight forwarder" : null}
      standing={forwarder}
      sending={sending}
      notice={notice}
      detail={count ? addressCount(count) : "No addresses yet"}
      onOpen={() => setOpen("addresses")}
      menu={
        <>
          <DropdownMenuItem onClick={() => setOpen("addresses")}>
            <MapPin />
            Addresses
          </DropdownMenuItem>
          {invitable && <DropdownMenuSeparator />}
          {invitable && !forwarder.invited && (
            <DropdownMenuItem onClick={() => setOpen("invite")}>
              <Send />
              Invite
            </DropdownMenuItem>
          )}
          {invitable && forwarder.invited && (
            <DropdownMenuItem disabled={sending} onClick={() => void resend()}>
              <Send />
              Resend invitation
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
