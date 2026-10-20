import { cartonList, type Pallet, validatePallets } from "@repo/aisle"
import { arrayIncludes } from "ts-extras"
import { useFormatter, useLocale, useTranslations } from "use-intl"
import type { PalletValue } from "@/lib/carton-groups"
import { palletTemplate, readPalletFile, type PalletImportResult } from "@/lib/pallet-import"
import { type ImportMode, SpreadsheetImportDialog } from "./spreadsheet-import-dialog"

// Issues with the file's columns, the file itself or a number say the same as the carton import's.
const sharedIssues = ["missingColumns", "duplicateColumns", "unknownColumns", "unreadable", "number"] as const

// Boards 07.13 to 07.15: a shipment's pallets from a spreadsheet, a row to a pallet with its size, gross weight,
// stacking and cartons by their IDs. They're checked against the shipment's cartons, and against the pallets already
// there when they're added to them.
export function PalletImportDialog({
  open,
  onOpenChange,
  context,
  cartonIds,
  existing,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The order and shipment, under the title.
  context: string
  // The shipment's cartons, one ID to a physical carton.
  cartonIds: string[]
  existing: PalletValue[]
  onImport: (pallets: Pallet[], mode: ImportMode) => Promise<void>
}) {
  const t = useTranslations("orders.palletImport")
  const cartonText = useTranslations("orders.cartonImport")
  const palletText = useTranslations("orders.pallets")
  const rules = useTranslations("server.readiness.packing")
  const locale = useLocale()

  function check(result: PalletImportResult, mode: ImportMode) {
    // Adding to the pallets there can repeat a pallet ID or a carton. The cartons left off pallets show in the form.
    const imported = new Set(result.pallets.map((pallet) => pallet.palletId.toLowerCase()))
    const checked =
      result.templateMatches && !result.issues.length
        ? validatePallets({
            cartons: cartonIds.map((cartonId) => ({ cartonId })),
            pallets: mode === "add" ? [...existing, ...result.pallets] : result.pallets
          }).filter(
            (issue) =>
              (issue.code === "duplicatePallet" || issue.code === "palletCartonTwice") &&
              imported.has(issue.palletId?.toLowerCase() ?? "")
          )
        : []
    return {
      templateMatches: result.templateMatches,
      fileIssues: result.issues.map((issue) => ({
        location: issue.row
          ? [cartonText("row", { row: issue.row }), issue.pallet ? palletText("name", { pallet: issue.pallet }) : ""]
              .filter(Boolean)
              .join(" / ")
          : "",
        message: arrayIncludes(sharedIssues, issue.code)
          ? cartonText(`errors.${issue.code}`, { value: issue.value ?? "" })
          : t(`errors.${issue.code}`, { value: issue.value ?? "", ...issue.values })
      })),
      issues: checked.map((issue) => ({
        location: issue.palletId ? palletText("name", { pallet: issue.palletId }) : "",
        message: "values" in issue ? rules(issue.code, issue.values) : rules(issue.code)
      })),
      rows: result.pallets.length
    }
  }

  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      context={context}
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
        fileName: "pallet-template.xlsx",
        build: () =>
          palletTemplate(
            [
              t("template.rows"),
              t("template.measurements"),
              t("template.stacking"),
              t("template.cartons"),
              ...(cartonIds.length ? [t("template.shipmentCartons", { cartons: cartonList(cartonIds) })] : []),
              t("template.format")
            ],
            locale === "ur"
          )
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
      <ul aria-label={palletText("title")} className="divide-y overflow-hidden rounded-lg border">
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
