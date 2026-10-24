import {
  Button,
  DialogTrigger,
  DropdownMenuItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@buildkitgg/shadcn-baseui-kit"
import type { Address } from "@repo/copacker-orders"
import { addressLine, addressSchema } from "@repo/copacker-orders"
import { originSchema } from "@repo/copacker-shipments"
import { MapPin, MapPinPlus } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { useAction } from "@/hooks/use-action"
import type { ActionFormOptions, FormSchema } from "@/hooks/use-action-form"
import { useEdge } from "@/hooks/use-edge"
import { cn } from "@/lib/utils"
import { AddressFields, emptyAddress } from "./address-fields"
import { AddressText } from "./address-text"
import { PhoneLink } from "./common"
import { FormInput } from "./form-controls"
import { FormDialog } from "./form-dialog"
import { RowActionsMenu } from "./row-actions-menu"

// A partner whose addresses the buyer keeps until it joins Copacker: a supplier, whose pickup addresses are where
// carriers collect its cartons, or a freight forwarder, whose addresses purchase orders ship to.
export type AddressPartner = { kind: "supplier" | "forwarder"; id: string; name: string }
export type PartnerAddress = { id: string; name: string; address: Address }

// An address with a name for it, such as "Yiwu warehouse": what AddressDialog edits.
export const namedAddressSchema = z.object({ name: z.string().trim().min(1).max(100), address: addressSchema })
// Amazon needs a phone number to schedule a pickup.
const pickupSchema = namedAddressSchema.extend({ address: originSchema })

// An address in brief: its name when it has one, its lines, and who to call there.
export function AddressSummary({
  name,
  address,
  className
}: {
  name?: string
  address: Partial<Address>
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3 text-sm", className)}>
      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        {name && <span className="font-medium">{name}</span>}
        <AddressText address={address} contact className={cn(name && "text-muted-foreground")} />
      </div>
    </div>
  )
}

// One address in a list of them: its name, with a badge when it says something, its street, and who to contact
// there, then any notes about it and the last action's error. `actions` is its menu.
export function AddressRow({
  name,
  badge,
  address,
  error,
  actions,
  children
}: {
  name: string
  badge?: React.ReactNode
  address: Address
  error?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {name}
          {badge}
        </p>
        <p className="text-muted-foreground">
          <bdi>{addressLine(address)}</bdi>
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>{address.name}</span>
          {address.phoneNumber && (
            <PhoneLink number={address.phoneNumber} className="hover:text-foreground hover:underline" />
          )}
          {address.email && (
            <a className="hover:text-foreground hover:underline" href={`mailto:${address.email}`}>
              {address.email}
            </a>
          )}
        </p>
        {children}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {actions}
    </li>
  )
}

// The one form for a named address, such as a saved delivery address or a supplier's pickup: its name, any fields
// `children` adds, then the address. A pickup's phone is required.
export function AddressDialog<S extends FormSchema>({
  trigger,
  open,
  onOpenChange,
  title,
  submitLabel,
  placeholder,
  requirePhone = false,
  form,
  children
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  submitLabel: string
  // An example name, such as "Yiwu warehouse".
  placeholder: string
  requirePhone?: boolean
  form: ActionFormOptions<S>
  children?: React.ReactNode
}) {
  const t = useTranslations("common.address")
  return (
    <FormDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="lg"
      submitLabel={submitLabel}
      form={form}
    >
      <FormInput name="name" required label={t("addressName")} placeholder={placeholder} autoComplete="off" />
      {children}
      <AddressFields path="address" requirePhone={requirePhone} />
    </FormDialog>
  )
}

type Saved = { id: string | undefined; name: string; address: Address }

// Adds or edits one of a partner's addresses. `onSaved` gets the address as saved, with its id when it's new.
export function PartnerAddressDialog({
  partner,
  contact,
  draft,
  trigger,
  open,
  onOpenChange,
  onSaved
}: {
  partner?: AddressPartner
  // The address being edited; without one, the dialog adds an address.
  contact?: PartnerAddress
  // Where a new address starts, such as a pickup address typed on a shipment.
  draft?: Partial<Address>
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSaved?: (saved: Saved) => void
}) {
  const t = useTranslations("partners.address")
  const pickup = !partner || partner.kind === "supplier"
  const packingText = useTranslations("orders.packing")
  let title = packingText("addNewAddress")
  if (partner) {
    title = pickup ? t("addPickup", { name: partner.name }) : t("add", { name: partner.name })
  }
  if (contact) {
    title = pickup ? t("editPickup") : t("edit")
  }
  return (
    <AddressDialog
      trigger={trigger}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      submitLabel={contact ? t("saveChanges") : t("save")}
      placeholder={pickup ? t("pickupPlaceholder") : t("placeholder")}
      requirePhone={pickup}
      form={{
        schema: pickup ? pickupSchema : namedAddressSchema,
        defaultValues: contact
          ? { name: contact.name, address: contact.address }
          : { name: "", address: { ...emptyAddress, ...draft } },
        // Without a partner, the address stays with what's being edited, such as a shipment's pickup, until it's saved.
        ...(partner
          ? {
              action: pickup ? "supplier.address" : "forwarder.address",
              toPayload: (values) => ({
                ...values,
                ...(pickup ? { supplierId: partner.id } : { forwarderId: partner.id }),
                ...(contact && { id: contact.id })
              })
            }
          : { run: async () => ({ id: crypto.randomUUID() }) }),
        onSuccess: (result, values) =>
          onSaved?.({ id: result.id ?? contact?.id, name: values.name, address: values.address })
      }}
    />
  )
}

// A partner's addresses in a side panel. The buyer keeps them until the partner joins; after that they're the
// partner's own, shown read-only.
export function PartnerAddressSheet({
  partner,
  joined,
  editable,
  addresses,
  open,
  onOpenChange,
  children
}: {
  partner: AddressPartner
  joined: boolean
  // An owner's, for a partner that hasn't joined.
  editable: boolean
  addresses: PartnerAddress[]
  open: boolean
  onOpenChange: (open: boolean) => void
  // The partner's own actions, at the foot of the panel.
  children?: React.ReactNode
}) {
  const t = useTranslations("partners.address")
  const side = useEdge("end")
  const supplier = partner.kind === "supplier"
  let description = supplier ? t("sheet.supplier") : t("sheet.forwarder")
  if (joined) {
    description = supplier ? t("sheet.joinedSupplier") : t("sheet.joinedForwarder")
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="flex flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{partner.name}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {addresses.length ? (
            <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
              {addresses.map((contact) => (
                <PartnerAddressRow key={contact.id} partner={partner} contact={contact} editable={editable} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {editable && (
            <div>
              <PartnerAddressDialog
                partner={partner}
                trigger={
                  <DialogTrigger render={<Button variant="outline" size="sm" />}>
                    <MapPinPlus data-icon="inline-start" />
                    {t("addButton")}
                  </DialogTrigger>
                }
              />
            </div>
          )}
        </div>
        {children && <div className="mt-auto flex gap-2 border-t p-4">{children}</div>}
      </SheetContent>
    </Sheet>
  )
}

function PartnerAddressRow({
  partner,
  contact,
  editable
}: {
  partner: AddressPartner
  contact: PartnerAddress
  editable: boolean
}) {
  const t = useTranslations("partners.address")
  const [editing, setEditing] = useState(false)
  const remove = useAction("supplier.address", { fallback: t("removeFailed", { name: contact.name }) })
  // Purchase orders ship to a forwarder's addresses by id, so only a supplier's pickup addresses are removed here.
  const removable = partner.kind === "supplier"
  return (
    <AddressRow
      name={contact.name}
      address={contact.address}
      error={remove.error}
      actions={
        editable && (
          <>
            <RowActionsMenu
              label={t("moreActions", { name: contact.name })}
              pending={remove.pending}
              pendingLabel={t("removing", { name: contact.name })}
            >
              <DropdownMenuItem onClick={() => setEditing(true)}>{t("menuEdit")}</DropdownMenuItem>
              {removable && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void remove.run({ supplierId: partner.id, id: contact.id, remove: true })}
                >
                  {t("menuRemove")}
                </DropdownMenuItem>
              )}
            </RowActionsMenu>
            <PartnerAddressDialog partner={partner} contact={contact} open={editing} onOpenChange={setEditing} />
          </>
        )
      }
    />
  )
}
