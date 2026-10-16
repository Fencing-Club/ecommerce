import type { Address } from "@repo/aisle"
import { useRouter } from "@tanstack/react-router"
import { Ellipsis, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import type { ContactKind } from "@/lib/contacts"
import { contactKindLabelKeys } from "@/lib/contacts"
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
  locations = [],
  admin
}: {
  contacts: Contact[]
  supplier?: boolean
  locations?: ShopifyLocation[]
  // Owners and admins add, edit and remove the workspace's addresses; everyone else sees them.
  admin: boolean
}) {
  const t = useTranslations("settings.addresses")
  const [open, setOpen] = useState(false)
  const count = supplier && !contacts.length ? t("noPickupAddresses") : t("count", { count: contacts.length })

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">{count}</p>
        {admin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Plus data-icon="inline-start" />
              {t("add")}
            </DialogTrigger>
            <DialogContent className={dialog}>
              <DialogHeader>
                <DialogTitle>{t("add")}</DialogTitle>
              </DialogHeader>
              <ContactForm supplier={supplier} locations={locations} onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>
      {contacts.length > 0 && (
        <ul className="divide-y border-t">
          {contacts.map((contact) => (
            <SavedAddress key={contact.id} contact={contact} supplier={supplier} locations={locations} admin={admin} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function SavedAddress({
  contact,
  supplier,
  locations,
  admin
}: {
  contact: Contact
  supplier: boolean
  locations: ShopifyLocation[]
  admin: boolean
}) {
  const t = useTranslations("settings.addresses")
  const partners = useTranslations("partners")
  const errorMessage = useErrorMessage()
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
  let location: string | null = null
  if (contact.kind === "delivery" && contact.shopifyLocationId) {
    const linked = locations.find((candidate) => candidate.id === contact.shopifyLocationId)
    location = linked ? t("stockArrivesAt", { location: linked.name }) : t("stockArrivesAtShopify")
  }

  async function remove() {
    setPending(true)
    setError("")
    try {
      await run({ action: "contact.delete", data: { id: contact.id } }).unwrap()
      router.invalidate()
    } catch (e) {
      setError(errorMessage(e, t("removeFailed")))
      setPending(false)
    }
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {contact.name}
          {contact.kind !== usual && <Badge variant="secondary">{partners(contactKindLabelKeys[contact.kind])}</Badge>}
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
        {location && <p className="text-xs text-muted-foreground">{location}</p>}
        {supplier && contact.kind === "pickup" && !address.phoneNumber && (
          <p className="text-xs text-destructive">{t("addPhone")}</p>
        )}
        {!supplier && contact.kind === "pickup" && (
          <p className="text-xs text-destructive">{t("supplierKeepsPickups")}</p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {admin && pending && (
        <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={t("removing", { name: contact.name })}>
          <Spinner />
        </Button>
      )}
      {admin && !pending && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={t("more", { name: contact.name })} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t("edit")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              {t("remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={admin && editing} onOpenChange={setEditing}>
        <DialogContent className={dialog}>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
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
