import { useLocale } from "use-intl"
import { DetailFields } from "./detail-fields"

export function ShipmentDetails({
  readyDate,
  cartons,
  units,
  weight,
  volume
}: {
  readyDate: string
  cartons: number
  units: number
  weight: number | null
  volume: number | null
}) {
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  return (
    <section aria-label="Shipment summary" className="space-y-3">
      <h2 className="text-sm font-semibold">Shipment details</h2>
      <DetailFields
        items={[
          {
            label: "Ready date",
            value: readyDate
              ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
                  new Date(`${readyDate}T00:00:00Z`)
                )
              : "—"
          }
        ]}
      />
      <DetailFields
        className="grid-cols-2"
        items={[
          { label: "Cartons", value: number.format(cartons) },
          { label: "Units", value: number.format(units) }
        ]}
      />
      <DetailFields
        className="grid-cols-2"
        items={[
          { label: "Gross weight", value: weight === null ? "—" : `${number.format(weight)} kg` },
          { label: "Volume", value: volume === null ? "—" : `${number.format(volume)} m³` }
        ]}
      />
    </section>
  )
}
