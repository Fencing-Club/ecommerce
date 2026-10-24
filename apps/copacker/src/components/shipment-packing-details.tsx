import { FieldTitle } from "@buildkitgg/shadcn-baseui-kit"
import type { Address } from "@repo/copacker-orders"
import { addressLine } from "@repo/copacker-orders"
import { MapPin, Truck } from "lucide-react"
import type { ReactNode } from "react"
import { objectKeys } from "ts-extras"
import { useTranslations } from "use-intl"
import { emptyAddress } from "./address-fields"
import { PhoneLink } from "./common"
import type { PartnerAddress } from "./partner-address"
import { RoutePreview } from "./route-preview"

/** The same card surrounds editable packing fields and the submitted shipment details. */
export function ShipmentPackingDetails({
  route,
  shipFrom,
  shipTo,
  transport,
  packing
}: {
  route?: string[]
  shipFrom: ReactNode
  shipTo?: ReactNode
  transport?: ReactNode
  packing?: ReactNode
}) {
  return (
    <section className="@container/packing-details overflow-hidden rounded-lg border bg-card text-sm">
      {route && <RoutePreview stops={route} className="border-b bg-muted/40 px-4 py-3" />}
      <div className="space-y-4 p-4">
        <div className={shipTo ? "grid items-start gap-6 @lg/packing-details:grid-cols-2" : "min-w-0"}>
          <div className="min-w-0 space-y-3">{shipFrom}</div>
          {shipTo && <div className="min-w-0">{shipTo}</div>}
        </div>
        {transport}
      </div>
      {packing && <div className="space-y-4 border-t p-4">{packing}</div>}
    </section>
  )
}

/** Both shipment addresses share a display; editable cards align the destination with the selector. */
export function ShipmentAddress({
  label,
  name,
  address,
  contact,
  readOnly = false
}: {
  label: string
  name: string
  address: string
  contact?: ReactNode
  readOnly?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {readOnly ? <p className="text-xs text-muted-foreground">{label}</p> : <FieldTitle>{label}</FieldTitle>}
      <div className={readOnly ? "flex min-w-0 items-start gap-3" : "flex min-w-0 py-3"}>
        {readOnly && <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="flex min-w-0 flex-col gap-1">
          {name && <p className="font-medium">{name}</p>}
          <p className={readOnly ? "text-sm text-muted-foreground" : "text-xs leading-relaxed text-muted-foreground"}>
            <bdi>{address}</bdi>
          </p>
          {contact && <div className="text-xs text-muted-foreground">{contact}</div>}
        </div>
      </div>
    </div>
  )
}

// Which saved address a pickup address is, while it's unchanged.
export const savedAddress = (addresses: PartnerAddress[], origin: Partial<Address>) =>
  addresses.find(({ address }) => objectKeys(emptyAddress).every((key) => (address[key] ?? "") === (origin[key] ?? "")))

// The saved address a packing's cartons leave from: the one its pickup address is, or for a packing without one yet,
// the supplier's only saved address.
export function startingAddress(addresses: PartnerAddress[], origin: Partial<Address> = {}) {
  const hasOrigin = objectKeys(emptyAddress).some((key) => origin[key])
  return !hasOrigin && addresses.length === 1 ? addresses[0] : savedAddress(addresses, origin)
}

// Where a packed shipment's cartons leave from: the supplier's saved address it is, or the address as entered, with its
// contact.
export function ShipmentOrigin({ origin, addresses }: { origin?: Partial<Address>; addresses: PartnerAddress[] }) {
  const t = useTranslations("orders.packing")
  const start = startingAddress(addresses, origin)
  const shown = { ...emptyAddress, ...(start?.address ?? origin) }
  return (
    <ShipmentAddress
      readOnly
      label={t("shipFrom")}
      name={start?.name ?? shown.name ?? ""}
      address={addressLine(shown)}
      contact={
        (shown.name || shown.phoneNumber) && (
          <bdi>
            {shown.name && <span>{shown.name}</span>}
            {shown.name && shown.phoneNumber && ", "}
            {shown.phoneNumber && <PhoneLink number={shown.phoneNumber} countryCode={shown.countryCode} />}
          </bdi>
        )
      }
    />
  )
}

export function ShipmentTransportLegs({ legs }: { legs: string[] }) {
  return (
    <div className="space-y-1.5 text-xs">
      {legs.map((leg, index) => (
        <p key={`${index}-${leg}`} className="flex items-start gap-2">
          <Truck aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
          {leg}
        </p>
      ))}
    </div>
  )
}
