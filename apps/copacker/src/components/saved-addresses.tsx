import { Badge, Button, DialogTrigger, DropdownMenuItem } from "@buildkitgg/shadcn-baseui-kit"
import type { Address } from "@repo/copacker-orders"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FlushCard } from "@/components/flush-card"
import { useAction } from "@/hooks/use-action"
import type { ContactKind } from "@/lib/contacts"
import { contactKindLabelKeys, contactKinds } from "@/lib/contacts"
import { emptyAddress } from "./address-fields"
import { FormSelect } from "./form-select"
import { AddressDialog, AddressRow, namedAddressSchema } from "./partner-address"
import { RowActionsMenu } from "./row-actions-menu"

type Contact = { id: string; name: string; kind: ContactKind; address: Address; shopifyLocationId: string | null }
type ShopifyLocation = { id: string; name: string }

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
  const count = supplier && !contacts.length ? t("noPickupAddresses") : t("count", { count: contacts.length })

  return (
    <FlushCard>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted-foreground">{count}</p>
        {admin && (
          <ContactDialog
            supplier={supplier}
            locations={locations}
            trigger={
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                <Plus data-icon="inline-start" />
                {t("add")}
              </DialogTrigger>
            }
          />
        )}
      </div>
      {contacts.length > 0 && (
        <ul className="divide-y border-t">
          {contacts.map((contact) => (
            <SavedAddress key={contact.id} contact={contact} supplier={supplier} locations={locations} admin={admin} />
          ))}
        </ul>
      )}
    </FlushCard>
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
  const [editing, setEditing] = useState(false)
  const remove = useAction("contact.delete", { fallback: t("removeFailed") })
  const { address } = contact
  // A supplier's addresses are all pickups, and everyone else's deliveries; only another kind needs saying.
  const usual: ContactKind = supplier ? "pickup" : "delivery"
  let location: string | null = null
  if (contact.kind === "delivery" && contact.shopifyLocationId) {
    const linked = locations.find((candidate) => candidate.id === contact.shopifyLocationId)
    location = linked ? t("stockArrivesAt", { location: linked.name }) : t("stockArrivesAtShopify")
  }

  return (
    <AddressRow
      name={contact.name}
      badge={
        contact.kind !== usual && <Badge variant="secondary">{partners(contactKindLabelKeys[contact.kind])}</Badge>
      }
      address={address}
      error={remove.error}
      actions={
        admin && (
          <>
            <RowActionsMenu
              label={t("more", { name: contact.name })}
              pending={remove.pending}
              pendingLabel={t("removing", { name: contact.name })}
            >
              <DropdownMenuItem onClick={() => setEditing(true)}>{t("edit")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => void remove.run({ id: contact.id })}>
                {t("remove")}
              </DropdownMenuItem>
            </RowActionsMenu>
            <ContactDialog
              contact={contact}
              supplier={supplier}
              locations={locations}
              open={editing}
              onOpenChange={setEditing}
            />
          </>
        )
      }
    >
      {location && <p className="text-xs text-muted-foreground">{location}</p>}
      {supplier && contact.kind === "pickup" && !address.phoneNumber && (
        <p className="text-xs text-destructive">{t("addPhone")}</p>
      )}
      {!supplier && contact.kind === "pickup" && (
        <p className="text-xs text-destructive">{t("supplierKeepsPickups")}</p>
      )}
    </AddressRow>
  )
}

const contactSchema = namedAddressSchema.extend({
  kind: z.enum(contactKinds),
  // Empty when a delivery address isn't linked to a Shopify location.
  shopifyLocationId: z.string()
})

// Adds a saved address, or edits `contact`. A buyer's delivery address can say which Shopify location it stocks.
function ContactDialog({
  contact,
  supplier,
  locations,
  trigger,
  open,
  onOpenChange
}: {
  contact?: Contact
  supplier: boolean
  locations: ShopifyLocation[]
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("settings.addresses")
  const kind = contact?.kind ?? (supplier ? "pickup" : "delivery")
  return (
    <AddressDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? t("editTitle") : t("add")}
      submitLabel={contact ? t("saveChanges") : t("saveAddress")}
      placeholder={t("namePlaceholder")}
      form={{
        schema: contactSchema,
        action: contact ? "contact.update" : "contact.create",
        defaultValues: {
          name: contact?.name ?? "",
          kind,
          address: { ...emptyAddress, ...contact?.address },
          shopifyLocationId: contact?.shopifyLocationId ?? ""
        },
        toPayload: (values) => ({
          ...(contact && { id: contact.id }),
          ...values,
          shopifyLocationId: values.shopifyLocationId || null
        })
      }}
    >
      {!supplier && kind === "delivery" && locations.length > 0 && (
        <FormSelect
          name="shopifyLocationId"
          label={t("shopifyLocation")}
          description={t("shopifyLocationDescription")}
          placeholder={t("notLinked")}
          options={locations.map((location) => ({ value: location.id, label: location.name }))}
        />
      )}
    </AddressDialog>
  )
}
