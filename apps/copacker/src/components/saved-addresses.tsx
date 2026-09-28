"use client"

import type { Address } from "@repo/aisle"
import { Ellipsis, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"
import { type ContactKind, contactKindLabels } from "@/lib/contacts"
import { formatPhone, phoneHref } from "@/lib/phone"
import { ContactForm } from "./settings-forms"

type Contact = { id: string; name: string; kind: ContactKind; address: Address; shopifyLocationId: string | null }
type ShopifyLocation = { id: string; name: string }

// A taller, wider dialog that scrolls when the address form exceeds the viewport.
const dialog = "max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl"

// The workspace's saved addresses as one list, with Add in the card's header and each address's Edit and Remove in
// its menu.
export function SavedAddresses({
  contacts,
  supplier = false,
  locations = []
}: {
  contacts: Contact[]
  supplier?: boolean
  locations?: ShopifyLocation[]
}) {
  const [open, setOpen] = useState(false)
  let count = supplier ? "No pickup addresses" : "No addresses"
  if (contacts.length) {
    count = `${contacts.length} ${contacts.length === 1 ? "address" : "addresses"}`
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">{count}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            <Plus data-icon="inline-start" />
            Add address
          </DialogTrigger>
          <DialogContent className={dialog}>
            <DialogHeader>
              <DialogTitle>Add address</DialogTitle>
            </DialogHeader>
            <ContactForm supplier={supplier} locations={locations} onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      {contacts.length > 0 && (
        <ul className="divide-y border-t">
          {contacts.map((contact) => (
            <SavedAddress key={contact.id} contact={contact} supplier={supplier} locations={locations} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function SavedAddress({
  contact,
  supplier,
  locations
}: {
  contact: Contact
  supplier: boolean
  locations: ShopifyLocation[]
}) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const { address } = contact
  // A supplier's addresses are all pickups, and everyone else's deliveries; only another kind needs saying.
  const usual: ContactKind = supplier ? "pickup" : "delivery"
  const street = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    [address.stateOrRegion, address.postalCode].filter(Boolean).join(" "),
    address.countryCode
  ]
    .filter(Boolean)
    .join(", ")
  const location =
    contact.kind === "delivery" && contact.shopifyLocationId
      ? (locations.find((candidate) => candidate.id === contact.shopifyLocationId)?.name ?? "a Shopify location")
      : null

  async function remove() {
    setPending(true)
    setError("")
    try {
      await run({ action: "contact.delete", data: { id: contact.id } }).unwrap()
      router.refresh()
    } catch (e) {
      setError(errorMessage(e, "Couldn't remove this address"))
      setPending(false)
    }
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {contact.name}
          {contact.kind !== usual && <Badge variant="secondary">{contactKindLabels[contact.kind]}</Badge>}
        </p>
        <p className="text-muted-foreground">{street}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>{address.name}</span>
          {address.phoneNumber && (
            <a className="tabular-nums hover:text-foreground hover:underline" href={phoneHref(address.phoneNumber)}>
              {formatPhone(address.phoneNumber)}
            </a>
          )}
          {address.email && (
            <a className="hover:text-foreground hover:underline" href={`mailto:${address.email}`}>
              {address.email}
            </a>
          )}
        </p>
        {location && <p className="text-xs text-muted-foreground">Stock arrives at {location}</p>}
        {supplier && contact.kind === "pickup" && !address.phoneNumber && (
          <p className="text-xs text-destructive">Add a phone number to use it on shipments</p>
        )}
        {!supplier && contact.kind === "pickup" && (
          <p className="text-xs text-destructive">Your supplier keeps pickups now, remove this once they’ve added it</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {pending ? (
        <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={`Removing ${contact.name}`}>
          <Spinner />
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${contact.name}`} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className={dialog}>
          <DialogHeader>
            <DialogTitle>Edit address</DialogTitle>
          </DialogHeader>
          <ContactForm
            contact={contact}
            supplier={supplier}
            locations={locations}
            onSuccess={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>
    </li>
  )
}
