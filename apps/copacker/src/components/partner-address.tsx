import { zodResolver } from "@hookform/resolvers/zod"
import type { Address } from "@repo/copacker-shipments"
import { addressSchema, originSchema } from "@repo/copacker-shipments"
import { useRouter } from "@tanstack/react-router"
import { Ellipsis, MapPin, MapPinPlus } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { useErrorMessage, useFormErrorMap } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { formatPhone } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { ActionForm } from "./action-form"
import { AddressFields, emptyAddress } from "./address-fields"
import { FormInput } from "./form-controls"

// A partner whose addresses the buyer keeps until it joins Copacker: a supplier, whose pickup addresses are where
// carriers collect its cartons, or a freight forwarder, whose addresses purchase orders ship to.
export type AddressPartner = { kind: "supplier" | "forwarder"; id: string; name: string }
export type PartnerAddress = { id: string; name: string; address: Address }

const addressForm = z.object({ name: z.string().trim().min(1).max(100), address: addressSchema })
// Amazon needs a phone number to schedule a pickup.
const pickupForm = addressForm.extend({ address: originSchema })

// "1000 Siji Road, Yiwu, Zhejiang, 322000, CN"
function addressLine(address: Partial<Address>) {
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.stateOrRegion,
    address.postalCode,
    address.countryCode
  ]
    .filter(Boolean)
    .join(", ")
}

// An address in brief: its name when it has one, its street, and who to call there.
export function AddressSummary({
  name,
  address,
  className
}: {
  name?: string
  address: Partial<Address>
  className?: string
}) {
  const contact = [address.name, address.phoneNumber && formatPhone(address.phoneNumber)].filter(Boolean).join(", ")
  return (
    <div className={cn("flex min-w-0 items-start gap-3 text-sm", className)}>
      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        {name && <span className="font-medium">{name}</span>}
        <span className={cn(name && "text-muted-foreground")}>{addressLine(address)}</span>
        {contact && <span className="text-xs text-muted-foreground">{contact}</span>}
      </div>
    </div>
  )
}

type Saved = { id: string | undefined; name: string; address: Address }

// Adds or edits one of a partner's addresses. `onSaved` gets the address as saved, with its id when it's new.
export function PartnerAddressDialog({
  partner,
  contact,
  draft,
  open,
  onOpenChange,
  onSaved
}: {
  partner?: AddressPartner
  // The address being edited; without one, the dialog adds an address.
  contact?: PartnerAddress
  // Where a new address starts, such as a pickup address typed on a shipment.
  draft?: Partial<Address>
  open: boolean
  onOpenChange: (open: boolean) => void
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so each opening starts from the current address. */}
        <AddressForm
          partner={partner}
          contact={contact}
          draft={draft}
          onSaved={(saved) => {
            onOpenChange(false)
            onSaved?.(saved)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function AddressForm({
  partner,
  contact,
  draft,
  onSaved
}: {
  partner?: AddressPartner
  contact?: PartnerAddress
  draft?: Partial<Address>
  onSaved: (saved: Saved) => void
}) {
  const t = useTranslations("partners.address")
  const errorMessage = useErrorMessage()
  const formErrorMap = useFormErrorMap()
  const router = useRouter()
  const [run] = useActionMutation()
  const pickup = !partner || partner.kind === "supplier"
  const form = useForm<z.input<typeof addressForm>, unknown, z.output<typeof addressForm>>({
    resolver: zodResolver(pickup ? pickupForm : addressForm, { error: formErrorMap }),
    defaultValues: contact
      ? { name: contact.name, address: contact.address }
      : { name: "", address: { ...emptyAddress, ...draft } }
  })
  const submit = form.handleSubmit(async (values) => {
    try {
      if (!partner) {
        onSaved({ id: crypto.randomUUID(), ...values })
        return
      }
      const result = await run({
        action: pickup ? "supplier.address" : "forwarder.address",
        data: {
          ...values,
          ...(pickup ? { supplierId: partner.id } : { forwarderId: partner.id }),
          ...(contact && { id: contact.id })
        }
      }).unwrap()
      onSaved({ id: result.id ?? contact?.id, name: values.name, address: values.address })
      router.invalidate()
    } catch (error) {
      form.setError("root.server", { message: errorMessage(error) })
    }
  })
  return (
    <ActionForm
      form={form}
      // The dialog may open from inside another form, such as a shipment's packing, which React would also submit.
      onSubmit={(event) => {
        event?.stopPropagation()
        return submit(event)
      }}
      label={contact ? t("saveChanges") : t("save")}
      dialog
    >
      <FormInput
        name="name"
        required
        label={t("name")}
        placeholder={pickup ? t("pickupPlaceholder") : t("placeholder")}
        autoComplete="off"
      />
      <AddressFields path="address" requirePhone={pickup} />
    </ActionForm>
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
  const [adding, setAdding] = useState(false)
  const supplier = partner.kind === "supplier"
  let description = supplier ? t("sheet.supplier") : t("sheet.forwarder")
  if (joined) {
    description = supplier ? t("sheet.joinedSupplier") : t("sheet.joinedForwarder")
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{partner.name}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {addresses.length ? (
            <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
              {addresses.map((contact) => (
                <AddressItem key={contact.id} partner={partner} contact={contact} editable={editable} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
          {editable && (
            <div>
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <MapPinPlus data-icon="inline-start" />
                {t("addButton")}
              </Button>
              <PartnerAddressDialog partner={partner} open={adding} onOpenChange={setAdding} />
            </div>
          )}
        </div>
        {children && <div className="mt-auto flex gap-2 border-t p-4">{children}</div>}
      </SheetContent>
    </Sheet>
  )
}

function AddressItem({
  partner,
  contact,
  editable
}: {
  partner: AddressPartner
  contact: PartnerAddress
  editable: boolean
}) {
  const t = useTranslations("partners.address")
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const [run] = useActionMutation()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState("")
  // Purchase orders ship to a forwarder's addresses by id, so only a supplier's pickup addresses are removed here.
  const removable = partner.kind === "supplier"

  async function remove() {
    setRemoving(true)
    setError("")
    try {
      await run({
        action: "supplier.address",
        data: { supplierId: partner.id, id: contact.id, remove: true }
      }).unwrap()
      router.invalidate()
    } catch (e) {
      setError(errorMessage(e, t("removeFailed", { name: contact.name })))
      setRemoving(false)
    }
  }

  return (
    <li className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AddressSummary name={contact.name} address={contact.address} />
        {error && (
          <p role="alert" className="ps-7 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      {editable && removing && (
        <Button variant="ghost" size="icon-sm" disabled aria-busy aria-label={t("removing", { name: contact.name })}>
          <Spinner />
        </Button>
      )}
      {editable && !removing && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={t("moreActions", { name: contact.name })} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t("menuEdit")}</DropdownMenuItem>
            {removable && (
              <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
                {t("menuRemove")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {editable && (
        <PartnerAddressDialog partner={partner} contact={contact} open={editing} onOpenChange={setEditing} />
      )}
    </li>
  )
}
