import type { Address } from "@repo/aisle"
import { useTranslations } from "use-intl"
import { AddressSummary } from "./partner-address"
import { ShipmentAddress } from "./shipment-packing-details"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

export function ShipmentDestination({
  addresses,
  pending,
  readOnly = false,
  compact = false
}: {
  addresses: Address[]
  pending: boolean
  readOnly?: boolean
  compact?: boolean
}) {
  const t = useTranslations("shipments.detail.shipTo")
  const content = addresses.length ? (
    addresses.map((address, index) => (
      <AddressSummary key={index} name={address.name} address={{ ...address, name: "" }} />
    ))
  ) : (
    <p className="text-sm text-muted-foreground">{t(pending ? "pending" : "unavailable")}</p>
  )
  if (compact) {
    return (
      <div className="space-y-3">
        {addresses.length ? (
          addresses.map((address, index) => (
            <ShipmentAddress
              readOnly={readOnly}
              key={index}
              label={t("title")}
              name={address.name}
              address={[
                address.addressLine1,
                address.addressLine2,
                address.city,
                address.stateOrRegion,
                address.postalCode,
                address.countryCode
              ]
                .filter(Boolean)
                .join(", ")}
            />
          ))
        ) : (
          <ShipmentAddress
            readOnly={readOnly}
            label={t("title")}
            name=""
            address={t(pending ? "pending" : "unavailable")}
          />
        )}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{content}</CardContent>
    </Card>
  )
}
