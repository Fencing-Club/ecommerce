"use client"

import type { Address } from "@repo/aisle"
import { MapPin, Pencil, Plus, Trash2, Truck, Warehouse } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { errorMessage, useActionMutation } from "@/lib/api"
import { type ContactKind, contactKindLabels } from "@/lib/contacts"
import { formatPhone, phoneHref } from "@/lib/phone"
import { FormError } from "./actions"
import { EmptyState } from "./common"
import { ContactForm } from "./settings-forms"
import * as styles from "./saved-addresses.css"
import { sx } from "@/styles/sprinkles.css"

type Contact = { id: string; name: string; kind: ContactKind; address: Address; shopifyLocationId: string | null }
type ShopifyLocation = { id: string; name: string }

const icons = { delivery: Warehouse, pickup: MapPin, forwarder: Truck }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{supplier ? "Pickup addresses" : "Saved addresses"}</CardTitle>
        <CardDescription>
          {supplier ? "Locations where Amazon or a carrier can collect your cartons." : "Where POs can be delivered."}
        </CardDescription>
        <CardAction>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" />}>
              <Plus data-icon="inline-start" />
              Add address
            </DialogTrigger>
            <DialogContent className={styles.dialog}>
              <DialogHeader>
                <DialogTitle>Add address</DialogTitle>
                <DialogDescription>
                  {supplier ? "Save a pickup location to reuse on shipments." : "Save a delivery address."}
                </DialogDescription>
              </DialogHeader>
              <ContactForm supplier={supplier} locations={locations} onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.length ? (
          <ItemGroup className={styles.list}>
            {contacts.map((contact) => (
              <SavedAddress key={contact.id} contact={contact} supplier={supplier} locations={locations} />
            ))}
          </ItemGroup>
        ) : (
          <EmptyState
            title="No saved addresses yet"
            description={
              supplier
                ? "Add your pickup locations so they're ready when you prepare a shipment."
                : "Add your delivery addresses so they're ready for your POs."
            }
          />
        )}
      </CardContent>
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
  const label = contactKindLabels[contact.kind]
  const Icon = icons[contact.kind]
  const { address } = contact

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
    <div className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
      <Item variant="outline" className={styles.item}>
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {contact.name}
            <Badge variant="secondary">{label}</Badge>
          </ItemTitle>
          <ItemDescription className={styles.unclamped}>
            {[address.name, address.addressLine1, address.addressLine2, address.city, address.countryCode]
              .filter(Boolean)
              .join(", ")}
          </ItemDescription>
          {(address.phoneNumber || address.email) && (
            <ItemDescription className={styles.contactLinks}>
              {address.phoneNumber && (
                <a className={sx({ fontVariantNumeric: "tabular" })} href={phoneHref(address.phoneNumber)}>
                  {formatPhone(address.phoneNumber)}
                </a>
              )}
              {address.email && <a href={`mailto:${address.email}`}>{address.email}</a>}
            </ItemDescription>
          )}
          {contact.kind === "delivery" && contact.shopifyLocationId && (
            <ItemDescription>
              Stock arrives at{" "}
              {locations.find((location) => location.id === contact.shopifyLocationId)?.name ?? "a Shopify location"}
            </ItemDescription>
          )}
          {supplier && contact.kind === "pickup" && !address.phoneNumber && (
            <ItemDescription className={styles.warning}>
              Add a phone number to use this address on shipments.
            </ItemDescription>
          )}
          {!supplier && contact.kind === "pickup" && (
            <ItemDescription className={styles.warning}>
              Pickup addresses now come from your supplier&apos;s workspace. Remove this once they&apos;ve added it.
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          <Dialog open={editing} onOpenChange={setEditing}>
            <DialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Edit ${contact.name}`} />}>
              <Pencil />
            </DialogTrigger>
            <DialogContent className={styles.dialog}>
              <DialogHeader>
                <DialogTitle>Edit address</DialogTitle>
                <DialogDescription>
                  Changes apply to future shipments. Shipments already submitted keep their pickup details.
                </DialogDescription>
              </DialogHeader>
              <ContactForm
                contact={contact}
                supplier={supplier}
                locations={locations}
                onSuccess={() => setEditing(false)}
              />
            </DialogContent>
          </Dialog>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${contact.name}`}
            disabled={pending}
            aria-busy={pending}
            onClick={remove}
          >
            {pending ? <Spinner /> : <Trash2 />}
          </Button>
        </ItemActions>
      </Item>
      <FormError message={error} />
    </div>
  )
}
