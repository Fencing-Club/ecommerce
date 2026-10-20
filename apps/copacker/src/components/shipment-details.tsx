import { useLocale, useTranslations } from "use-intl"
import { DetailFields } from "./detail-fields"

// The packing page's summary beside the cartons.
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
  const t = useTranslations("shipments.detail.summary")
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  return (
    <section aria-label={t("title")} className="space-y-3 [&_dd]:mt-1.5 [&_dd]:font-medium">
      <h2 className="text-sm font-semibold">{t("title")}</h2>
      <DetailFields
        items={[
          {
            label: t("readyDate"),
            value: readyDate
              ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
                  new Date(`${readyDate}T00:00:00Z`)
                )
              : "—"
          }
        ]}
      />
      <DetailFields
        className="grid-cols-2 gap-6"
        items={[
          { label: t("cartons"), value: number.format(cartons) },
          { label: t("units"), value: number.format(units) }
        ]}
      />
      <DetailFields
        className="grid-cols-2 gap-6"
        items={[
          { label: t("grossWeight"), value: weight === null ? "—" : `${number.format(weight)} kg` },
          { label: t("volume"), value: volume === null ? "—" : `${number.format(volume)} m³` }
        ]}
      />
    </section>
  )
}
