import type { Address } from "@repo/aisle"
import { useTranslations } from "use-intl"
import { AddressSummary } from "./partner-address"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

export function ShipmentDestination({ addresses, pending }: { addresses: Address[]; pending: boolean }) {
  const t = useTranslations("shipments.detail.shipTo")
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {addresses.length ? (
          addresses.map((address, index) => (
            <AddressSummary key={index} name={address.name} address={{ ...address, name: "" }} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t(pending ? "pending" : "unavailable")}</p>
        )}
      </CardContent>
    </Card>
  )
}
