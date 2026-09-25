"use client"

import type { Address } from "@repo/aisle"
import { MapPin, Pencil, Plus, Trash2, Truck } from "lucide-react"
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
import { formatPhone, phoneHref } from "@/lib/phone"
import { FormError } from "./actions"
import { EmptyState } from "./common"
import { ContactForm } from "./settings-forms"
import * as styles from "./saved-addresses.css"
import { sx } from "@/styles/sprinkles.css"

type Contact = { id: string; name: string; kind: "pickup" | "forwarder"; address: Address }

const kinds = {
  pickup: { label: "Pickup address", icon: MapPin },
  forwarder: { label: "Freight forwarder", icon: Truck }
}

export function SavedAddresses({ contacts }: { contacts: Contact[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved addresses</CardTitle>
        <CardDescription>Pickup locations and freight forwarders you can reuse on shipments.</CardDescription>
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
                  Save a pickup location or a freight forwarder to reuse on shipments.
                </DialogDescription>
              </DialogHeader>
              <ContactForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.length ? (
          <ItemGroup className={styles.list}>
            {contacts.map((contact) => (
              <SavedAddress key={contact.id} contact={contact} />
            ))}
          </ItemGroup>
        ) : (
          <EmptyState
            title="No saved addresses yet"
            description="Add your pickup locations and freight forwarders so they're ready when you prepare a shipment."
          />
        )}
      </CardContent>
    </Card>
  )
}

function SavedAddress({ contact }: { contact: Contact }) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const { label, icon: Icon } = kinds[contact.kind]
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
          {contact.kind === "pickup" && !address.phoneNumber && (
            <ItemDescription className={styles.warning}>
              Add a phone number to use this address on shipments.
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
              <ContactForm contact={contact} onSuccess={() => setEditing(false)} />
            </DialogContent>
          </Dialog>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${contact.name}`}
            disabled={pending}
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
