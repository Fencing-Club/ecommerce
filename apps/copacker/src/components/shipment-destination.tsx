import type { Address } from "@repo/aisle"
import { useTranslations } from "use-intl"
import { AddressSummary } from "./partner-address"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"

export function ShipmentDestination({
  addresses,
  pending,
  compact = false
}: {
  addresses: Address[]
  pending: boolean
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
      <section className="min-w-0">
        <h2 className="mb-2 text-sm font-medium">{t("title")}</h2>
        <div className="flex flex-col gap-3">{content}</div>
      </section>
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
