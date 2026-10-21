import { type OrderInput } from "@repo/aisle"
import { validatePacking } from "@repo/copacker-packing-rules"
import { useFormatter, useTranslations } from "use-intl"
import { useCartonTemplate } from "@/hooks/use-import-templates"
import { cartonTotals, expandCartonGroups, type CartonGroup } from "@/lib/carton-groups"
import { readCartonFile, type CartonImportResult } from "@/lib/carton-import"
import { issueValues } from "@/lib/packing-messages"
import { cn } from "@/lib/utils"
import { ProductIdentity } from "./product-identity"
import { type ImportMode, scrollList, SpreadsheetImportDialog } from "./spreadsheet-import-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"

export type CartonImportMode = ImportMode

export function CartonImportDialog({
  open,
  onOpenChange,
  order,
  shipmentName,
  existing,
  availablePieces,
  packingGroups,
  onImport
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OrderInput
  shipmentName: string
  existing: CartonGroup[]
  availablePieces: Record<string, number>
  // Amazon's packing groups by SKU, once Amazon has set them for the shipment's FBA cartons.
  packingGroups?: Readonly<Record<string, string>>
  onImport: (groups: CartonGroup[], mode: CartonImportMode) => Promise<void>
}) {
  const t = useTranslations("orders.cartonImport")
  const rules = useTranslations("server.readiness.packing")
  const editor = useTranslations("orders.cartonEditor")
  const template = useCartonTemplate(order)

  function check(result: CartonImportResult, mode: CartonImportMode) {
    const combined = mode === "add" ? [...existing, ...result.groups] : result.groups
    const tooMany = !result.issues.length && cartonTotals(combined).cartons > 1000
    const checked =
      result.templateMatches && !result.issues.length && !tooMany
        ? validatePacking(
            order,
            { cartons: expandCartonGroups(combined), changes: [], packingGroups },
            Object.fromEntries(
              order.items.map((item) => [item.id, Math.max(0, item.pieces - (availablePieces[item.id] ?? 0))])
            )
          ).issues
        : []
    return {
      templateMatches: result.templateMatches,
      fileIssues: result.issues.map((issue) => ({
        location: issue.row
          ? [t("row", { row: issue.row }), issue.carton ? editor("carton", { carton: issue.carton }) : ""]
              .filter(Boolean)
              .join(" / ")
          : "",
        message: t(`errors.${issue.code}`, { value: issue.value ?? "" })
      })),
      issues: [
        ...checked.map((issue) => ({
          location: issue.cartonId ? editor("carton", { carton: issue.cartonId }) : "",
          message: rules(issue.code, issueValues(issue, order.items))
        })),
        ...(tooMany ? [{ location: "", message: t("errors.limit") }] : [])
      ],
      rows: result.groups.length
    }
  }

  return (
    <SpreadsheetImportDialog
      open={open}
      onOpenChange={onOpenChange}
      reference={order.reference}
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
      read={(file) => readCartonFile(file, order.items)}
      check={check}
      template={{
        title: "Carton template",
        build: () => template()
      }}
      renderReview={(result) => <CartonReview groups={result.groups} order={order} />}
      onImport={(result, mode) => onImport(result.groups, mode)}
    />
  )
}

// The cartons a file holds, as accordions of their products.
function CartonReview({ groups, order }: { groups: CartonGroup[]; order: OrderInput }) {
  const t = useTranslations("orders.cartonImport")
  const editor = useTranslations("orders.cartonEditor")
  const format = useFormatter()
  const totals = cartonTotals(groups)
  return (
    <>
      <div className="flex justify-between gap-3 text-xs font-medium">
        <span>{t("cartonCount", { count: totals.cartons })}</span>
        <span>
          {t("productCount", {
            count: new Set(groups.flatMap((carton) => carton.items.map((item) => item.itemId))).size
          })}
        </span>
        <span>{editor("unitCount", { count: totals.pieces })}</span>
      </div>
      <Accordion
        defaultValue={groups[0] ? [groups[0].cartonId] : []}
        className={cn("min-h-0 rounded-lg border", scrollList, groups.length > 3 && "min-h-48")}
      >
        {groups.map((carton) => (
          <AccordionItem key={carton.cartonId} value={carton.cartonId}>
            <AccordionTrigger className="items-center gap-3 rounded-none bg-muted/50 px-3 hover:no-underline">
              <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                <span className="flex justify-between gap-3">
                  <span>{editor("carton", { carton: carton.cartonId })}</span>
                  <span>
                    {editor("unitCount", {
                      count: carton.items.reduce((sum, item) => sum + item.pieces, 0) * carton.count
                    })}
                  </span>
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {carton.count > 1 && <>{t("cartonCount", { count: carton.count })} / </>}
                  {t("measurements", {
                    count: carton.count,
                    length: format.number(carton.length),
                    width: format.number(carton.width),
                    height: format.number(carton.height),
                    weight: format.number(carton.weight)
                  })}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0 [&_p:not(:last-child)]:mb-0">
              {carton.items.map((content) => {
                const product = order.items.find((item) => item.id === content.itemId)
                return product ? (
                  <div key={content.itemId} className="flex items-center gap-3 border-t p-3">
                    <div className="min-w-0 flex-1">
                      <ProductIdentity item={product} />
                    </div>
                    <div className="text-end tabular-nums">
                      <p>{format.number(content.pieces / product.piecesPerSet)}</p>
                      {product.piecesPerSet > 1 && (
                        <p className="text-xs text-muted-foreground">
                          {editor("unitCount", { count: content.pieces })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null
              })}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </>
  )
}
