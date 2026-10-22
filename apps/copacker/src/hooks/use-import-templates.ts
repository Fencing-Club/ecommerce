import { type OrderInput } from "@repo/copacker-orders"
import { cartonList } from "@repo/copacker-packing-rules"
import { useLocale, useTranslations } from "use-intl"
import type { CartonGroup, PalletValue } from "@/lib/carton-groups"
import { cartonColumns, cartonExample, cartonRows, cartonTemplate } from "@/lib/carton-import"
import { palletColumns, palletExample, palletRows, palletTemplate } from "@/lib/pallet-import"

// What to enter in each of the templates' columns, in the order of cartonColumns and palletColumns.
const cartonKeys = [
  "cartonId",
  "cartonCount",
  "supplierSku",
  "quantity",
  "length",
  "width",
  "height",
  "weight",
  "product",
  "variant",
  "unitsPerPack"
] as const
const palletKeys = ["palletId", "length", "width", "height", "weight", "stacking", "cartonIds"] as const

function useHeadings() {
  const t = useTranslations("orders.importTemplate")
  return [t("column"), t("entry"), t("example")] as const
}

// The carton template for an order, with its instructions in the reader's language: blank to fill in, or with the
// shipment's cartons to export, edit and import again.
export function useCartonTemplate(order: OrderInput) {
  const t = useTranslations("orders.cartonImport")
  const headings = useHeadings()
  const rightToLeft = useLocale() === "ur"
  return (cartons: CartonGroup[] = []) => {
    const example = cartonExample(order.items)
    return cartonTemplate(
      order.items,
      {
        headings,
        columns: cartonColumns.map((column, index) => ({
          column,
          entry: t(`template.columns.${cartonKeys[index]!}`),
          example: example[0]?.[index] ?? ""
        })),
        notes: [t("template.notes.rows"), t("template.notes.sameCarton"), t("template.notes.format")]
      },
      example,
      rightToLeft,
      cartonRows(cartons, order.items)
    )
  }
}

// The pallet template for a shipment's cartons, one ID to a physical carton, with its instructions in the reader's
// language: blank to fill in, or with the shipment's pallets to export, edit and import again.
export function usePalletTemplate(cartonIds: string[]) {
  const t = useTranslations("orders.palletImport")
  const headings = useHeadings()
  const rightToLeft = useLocale() === "ur"
  return (pallets: PalletValue[] = []) => {
    const example = palletExample(cartonIds)
    return palletTemplate(
      {
        headings,
        columns: palletColumns.map((column, index) => ({
          column,
          entry: t(`template.columns.${palletKeys[index]!}`),
          example: example[0]?.[index] ?? ""
        })),
        notes: [
          t("template.notes.rows"),
          ...(cartonIds.length ? [t("template.notes.shipmentCartons", { cartons: cartonList(cartonIds) })] : []),
          t("template.notes.format")
        ]
      },
      example,
      rightToLeft,
      palletRows(pallets)
    )
  }
}
