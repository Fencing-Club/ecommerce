import { type Pallet } from "@repo/aisle"
import { cartonList, validatePallets } from "@repo/copacker-packing-rules"
import { arrayIncludes } from "ts-extras"
import { useFormatter, useTranslations } from "use-intl"
import { usePalletTemplate } from "@/hooks/use-import-templates"
import type { PalletValue } from "@/lib/carton-groups"
import { readPalletFile, type PalletImportResult } from "@/lib/pallet-import"
import { cn } from "@/lib/utils"
import { type ImportMode, scrollList, SpreadsheetImportDialog } from "./spreadsheet-import-dialog"

// Issues with the file's columns, the file itself or a number say the same as the carton import's.
const sharedIssues = ["missingColumns", "duplicateColumns", "unknownColumns", "unreadable", "number"] as const

// Boards 07.13 to 07.15: a shipment's pallets from a spreadsheet, a row to a pallet with its size, gross weight,
// stacking and cartons by their IDs. They're checked against the shipment's cartons, and against the pallets already
// there when they're added to them.
export function PalletImportDialog({
  open,
  onOpenChange,
  reference,
  shipmentName,
  cartonIds,
  existing,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The order and shipment, shown under the title and in the template's file name.
  reference: string
  shipmentName: string
  // The shipment's cartons, one ID to a physical carton.
  cartonIds: string[]
  existing: PalletValue[]
  onImport: (pallets: Pallet[], mode: ImportMode) => Promise<void>
}) {
  const t = useTranslations("orders.palletImport")
  const cartonText = useTranslations("orders.cartonImport")
  const palletText = useTranslations("orders.pallets")
  const template = usePalletTemplate(cartonIds)

  const location = (row: number, pallet: string) =>
    [cartonText("row", { row }), pallet ? palletText("name", { pallet }) : ""].filter(Boolean).join(" / ")

  // Adding the file's pallets to the ones there can repeat a pallet ID or put a carton on two pallets. Each clash is
  // said by the file's pallet and row, naming the pallet already there, rather than carton by carton. The file's own
  // rows can't clash with each other, and the cartons left off pallets show in the form.
  function clashes(result: PalletImportResult) {
    const issues = validatePallets({
      cartons: cartonIds.map((cartonId) => ({ cartonId })),
      pallets: [...existing, ...result.pallets]
    })
    const holders = new Map(
      existing.flatMap((pallet) => pallet.cartonIds.map((id) => [id.toLowerCase(), pallet.palletId] as const))
    )
    return result.pallets.flatMap((pallet, index) => {
      const where = location(result.rows[index] ?? 0, pallet.palletId)
      const own = issues.filter((issue) => issue.palletId?.toLowerCase() === pallet.palletId.toLowerCase())
      const held = new Map<string, string[]>()
      for (const issue of own) {
        if (issue.code === "palletCartonTwice") {
          const holder = holders.get(issue.values.carton.toLowerCase())
          if (holder) {
            held.set(holder, [...(held.get(holder) ?? []), issue.values.carton])
          }
        }
      }
      return [
        ...(own.some((issue) => issue.code === "duplicatePallet")
          ? [{ location: where, message: t("clashes.palletExists", { pallet: pallet.palletId }) }]
          : []),
        ...[...held].map(([holder, cartons]) => ({
          location: where,
          message: t("clashes.cartonsOnPallet", { count: cartons.length, cartons: cartonList(cartons), pallet: holder })
        }))
      ]
    })
  }

  function check(result: PalletImportResult, mode: ImportMode) {
    const checked =
      mode === "add" && existing.length && result.templateMatches && !result.issues.length ? clashes(result) : []
    return {
      templateMatches: result.templateMatches,
      fileIssues: result.issues.map((issue) => ({
        location: issue.row ? location(issue.row, issue.pallet ?? "") : "",
        message: arrayIncludes(sharedIssues, issue.code)
          ? cartonText(`errors.${issue.code}`, { value: issue.value ?? "" })
          : t(`errors.${issue.code}`, { value: issue.value ?? "", ...issue.values })
      })),
      issues: checked,
      hint: checked.length ? t("clashes.replace", { count: existing.length }) : undefined,
      rows: result.pallets.length
    }
  }

  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      reference={reference}
      shipmentName={shipmentName}
      text={{
        title: t("title"),
        review: t("review"),
        reviewTitle: t("reviewTitle"),
        failed: t("failed"),
        add: t("add"),
        replace: t("replace"),
        import: t("import"),
        importing: t("importing")
      }}
      hasExisting={existing.length > 0}
      read={(file) => readPalletFile(file, cartonIds)}
      check={check}
      template={{
        title: "Pallet template",
        build: () => template()
      }}
      renderReview={(result) => <PalletReview pallets={result.pallets} />}
      onImport={(result, mode) => onImport(result.pallets, mode)}
    />
  )
}

// Board 07.14: the pallets a file holds, with their totals, a row to a pallet.
function PalletReview({ pallets }: { pallets: Pallet[] }) {
  const t = useTranslations("orders.palletImport")
  const cartonText = useTranslations("orders.cartonImport")
  const palletText = useTranslations("orders.pallets")
  const format = useFormatter()
  return (
    <>
      <div className="flex justify-between gap-3 text-xs font-medium tabular-nums">
        <span>{t("palletCount", { count: pallets.length })}</span>
        <span>
          {cartonText("cartonCount", { count: pallets.reduce((sum, pallet) => sum + pallet.cartonIds.length, 0) })}
        </span>
        <span>{t("weight", { weight: format.number(pallets.reduce((sum, pallet) => sum + pallet.weight, 0)) })}</span>
      </div>
      <ul
        aria-label={palletText("title")}
        // The list scrolls and holds nothing focusable, so it takes focus for the keyboard to scroll it.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className={cn("min-h-0 divide-y rounded-lg border", scrollList, pallets.length > 3 && "min-h-48")}
      >
        {pallets.map((pallet) => (
          <li key={pallet.palletId} className="flex flex-wrap justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{palletText("name", { pallet: pallet.palletId })}</span>
              <span className="text-xs text-muted-foreground">
                {t("cartons", { count: pallet.cartonIds.length, cartons: cartonList(pallet.cartonIds) })}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-end tabular-nums">
              <span>
                {t("dimensions", {
                  length: format.number(pallet.length),
                  width: format.number(pallet.width),
                  height: format.number(pallet.height)
                })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("weightAndStacking", {
                  weight: format.number(pallet.weight),
                  stacking: palletText(pallet.stackable ? "stackable" : "notStackable")
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
