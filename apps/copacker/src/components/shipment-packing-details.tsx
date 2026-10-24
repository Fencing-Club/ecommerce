import type { Address } from "@repo/copacker-orders"
import { Truck } from "lucide-react"
import { objectKeys } from "ts-extras"
import { emptyAddress } from "./address-fields"
import type { PartnerAddress } from "./partner-address"

// Which saved address a pickup address is, while it's unchanged.
export const savedAddress = (addresses: PartnerAddress[], origin: Partial<Address>) =>
  addresses.find(({ address }) => objectKeys(emptyAddress).every((key) => (address[key] ?? "") === (origin[key] ?? "")))

// The saved address a packing's cartons leave from: the one its pickup address is, or for a packing without one yet,
// the supplier's only saved address.
export function startingAddress(addresses: PartnerAddress[], origin: Partial<Address> = {}) {
  const hasOrigin = objectKeys(emptyAddress).some((key) => origin[key])
  return !hasOrigin && addresses.length === 1 ? addresses[0] : savedAddress(addresses, origin)
}

// How the cartons travel as the shipment's transport says, one line per leg, under the shipment's route.
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
