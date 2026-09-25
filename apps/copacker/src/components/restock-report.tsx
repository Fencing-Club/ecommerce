"use client"

import { money } from "@repo/aisle"
import { ImageOff } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { dayRange } from "@/server/restock-report"
import * as styles from "./restock-report.css"
import { sx } from "@/styles/sprinkles.css"

type Line = {
  variantId: string
  product: string
  variant: string | null
  sku: string | null
  imageUrl: string | null
}
type ReorderLine = Line & {
  purchaseUnits: number
  daysRemaining: number | null
  soldAlone: number
  soldInBundles: number
  caseCount: number | null
  estimatedCostMinor: number | null
  costCurrency: string | null
}
type MultipackLine = Line & { bundlesSold: number; available: number | null }
type Target = {
  key: string
  pool: "shopify" | "fba" | "awd"
  locationId: string
  label: string
  observedAt: string | null
}
type Report = {
  target: { pool: "shopify"; locationId: string } | { pool: "fba" | "awd" }
  days: number
  leadTimeDays: number
  unmatchedUnits: number
  blockedCount: number
  unmatchedStockSkus: number
  sources: {
    source: "shopify" | "amazon"
    error: string | null
    gapUnits: number
    gapReasons: Record<string, { units: number; unknownCount: number }>
  }[]
  reorder: ReorderLine[]
  multipacks: MultipackLine[]
}

const restockApi = api.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    restockTargets: build.query<Target[], void>({
      query: () => "restock/targets"
    }),
    restockReport: build.mutation<
      Report,
      { days: number; leadTimeDays: number; target: { pool: "shopify"; locationId: string } | { pool: "fba" | "awd" } }
    >({
      query: (body) => ({ url: "inventory/sales", method: "POST", body })
    })
  })
})

const sourceNames = { shopify: "Shopify", amazon: "Amazon" } as const
// Why sold units couldn't be counted, as the sales reader reports them.
const gapNames: Record<string, string> = {
  channel_unmapped: "from other sales channels",
  location_unmapped: "shipped from unclassified locations",
  unfulfilled: "not shipped yet",
  product_unmapped: "without a product",
  quantity_unknown: "with an unknown quantity",
  fulfillment_unmapped: "with an unknown fulfillment method"
}

function Thumbnail({ url }: { url: string | null }) {
  return url ? (
    <Image src={url} alt="" width={32} height={32} unoptimized className={styles.thumb} />
  ) : (
    <span className={styles.placeholder} aria-hidden="true">
      <ImageOff />
    </span>
  )
}

function Name({ line }: { line: Line }) {
  return (
    <span className={styles.name}>
      <Thumbnail url={line.imageUrl} />
      <span className={sx({ display: "flex", flexDirection: "column", minWidth: 0 })}>
        <span className={styles.title}>
          {line.product}
          {line.variant && `, ${line.variant}`}
        </span>
        <span className={styles.detail}>{line.sku ?? "No SKU"}</span>
      </span>
    </span>
  )
}

// Explains sources that couldn't be read and sales that couldn't be matched to a product.
function Notes({ report }: { report: Report }) {
  const notes = [
    ...report.sources.flatMap(({ source, error, gapUnits, gapReasons }) => [
      error && `${sourceNames[source]}: ${error}`,
      (gapUnits > 0 || Object.values(gapReasons).some((gap) => gap.unknownCount > 0)) &&
        `${sourceNames[source]}: not counted, ${Object.entries(gapReasons)
          .filter(([, gap]) => gap.units > 0 || gap.unknownCount > 0)
          .map(
            ([reason, gap]) =>
              `${gap.units} units ${gapNames[reason] ?? reason.replaceAll("_", " ")}${gap.unknownCount ? ` and ${gap.unknownCount} unknown quantities` : ""}`
          )
          .join(", ")}.`
    ]),
    report.unmatchedUnits > 0 && `${report.unmatchedUnits} units sold under SKUs that don't match one Shopify product.`,
    report.unmatchedStockSkus > 0 &&
      `${report.unmatchedStockSkus} Amazon inventory SKUs do not match exactly one Shopify variant and were excluded.`
  ].filter((note) => typeof note === "string")
  return notes.length ? (
    <ul className={styles.notes} aria-live="polite">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  ) : null
}

function Reorder({ report }: { report: Report }) {
  if (
    report.sources.some(
      (source) => source.error !== null && source.source === (report.target.pool === "shopify" ? "shopify" : "amazon")
    )
  ) {
    return (
      <p className={styles.summary}>
        Restock needs sales from every connected store. Fix the issue above and try again.
      </p>
    )
  }
  if (!report.reorder.length) {
    return (
      <p className={styles.summary}>
        {report.blockedCount
          ? `${report.blockedCount} variations need more complete stock or sales data before Copacker can recommend a quantity.`
          : `Nothing needs reordering to cover the next ${report.leadTimeDays} days at the last ${report.days} days' rate.`}
      </p>
    )
  }
  // A PO holds up to 100 lines.
  const lines = report.reorder.slice(0, 100)
  const params = new URLSearchParams(lines.map((line) => ["variant", `${line.variantId}@${line.purchaseUnits}`]))
  let destination = "awd_us"
  if (report.target.pool === "shopify") {
    destination = "warehouse"
  } else if (report.target.pool === "fba") {
    destination = "fba"
  }
  params.set("destination", destination)
  if (report.target.pool === "shopify") {
    params.set("locationId", report.target.locationId)
  }
  const href = `/orders/new?${params}`
  return (
    <section className={styles.section} aria-labelledby="reorder-heading">
      <div className={styles.heading}>
        <h2 id="reorder-heading" className={styles.sectionTitle}>
          {report.reorder.length} {report.reorder.length === 1 ? "variation" : "variations"} to reorder
        </h2>
        <Button nativeButton={false} render={<Link href={href} />}>
          Create PO
        </Button>
      </div>
      <p className={styles.summary}>
        Enough to cover {report.leadTimeDays} days at the last {report.days} days&apos; rate, after stock and
        what&apos;s on order. Case counts use the product&apos;s default case pack, or Shopify&apos;s case quantity.
        Estimated cost uses Shopify&apos;s unit cost and excludes freight, duties and fees.
        {report.reorder.length > 100 && " The PO includes the 100 most urgent."}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className={styles.number}>Stock left</TableHead>
            <TableHead className={styles.number}>Sold alone</TableHead>
            <TableHead className={styles.number}>In multipacks</TableHead>
            <TableHead className={styles.number}>Reorder</TableHead>
            <TableHead className={styles.number}>Cases</TableHead>
            <TableHead className={styles.number}>Estimated cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.reorder.map((line) => (
            <TableRow key={line.variantId}>
              <TableCell>
                <Name line={line} />
              </TableCell>
              <TableCell className={styles.number}>
                {line.daysRemaining === null ? "Unknown" : `${line.daysRemaining} days`}
              </TableCell>
              <TableCell className={styles.number}>{line.soldAlone}</TableCell>
              <TableCell className={styles.number}>{line.soldInBundles}</TableCell>
              <TableCell className={styles.number}>
                <strong>{line.purchaseUnits}</strong>
              </TableCell>
              <TableCell className={styles.number}>{line.caseCount ?? "—"}</TableCell>
              <TableCell className={styles.number}>
                {line.estimatedCostMinor !== null && line.costCurrency
                  ? money(line.estimatedCostMinor, line.costCurrency)
                  : "Unknown"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

function Multipacks({ report }: { report: Report }) {
  if (!report.multipacks.length) {
    return null
  }
  return (
    <section className={styles.section} aria-labelledby="multipack-heading">
      <h2 id="multipack-heading" className={styles.sectionTitle}>
        Multipacks and bundles sold
      </h2>
      <p className={styles.summary}>
        Bundles hold no stock of their own in Shopify. Reorder one as its own product when it sells well, for example a
        multipack listed on Amazon.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bundle</TableHead>
            <TableHead className={styles.number}>Sold</TableHead>
            <TableHead className={styles.number}>Available from parts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.multipacks.map((line) => (
            <TableRow key={line.variantId}>
              <TableCell>
                <Name line={line} />
              </TableCell>
              <TableCell className={styles.number}>{line.bundlesSold}</TableCell>
              <TableCell className={styles.number}>{line.available ?? "Unknown"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

// A whole number of days within the supported range, or null.
function wholeDays(text: string) {
  const value = Number(text)
  return Number.isInteger(value) && value >= dayRange.min && value <= dayRange.max ? value : null
}

export function RestockReport() {
  // Kept as typed so the fields can be cleared while editing; validated before loading.
  const [daysText, setDaysText] = useState("56")
  const [leadTimeText, setLeadTimeText] = useState("56")
  const days = wholeDays(daysText)
  const leadTimeDays = wholeDays(leadTimeText)
  const [targetKey, setTargetKey] = useState("")
  const { data: targets = [], isLoading: targetsLoading } = restockApi.useRestockTargetsQuery()
  const target = targets.find((item) => item.key === targetKey) ?? targets[0]
  const [load, result] = restockApi.useRestockReportMutation({ fixedCacheKey: "restock-report" })
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.controls}>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-target">Restock location</FieldLabel>
          <NativeSelect
            id="restock-target"
            value={target?.key ?? ""}
            onChange={(event) => setTargetKey(event.target.value)}
          >
            {!target && <NativeSelectOption value="">No connected inventory</NativeSelectOption>}
            {targets.map((item) => (
              <NativeSelectOption key={item.key} value={item.key}>
                {item.pool === "shopify" ? `Shopify: ${item.label}` : item.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.days} data-invalid={days === null}>
          <FieldLabel htmlFor="restock-days">Sales period (days)</FieldLabel>
          <Input
            id="restock-days"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={daysText}
            aria-invalid={days === null}
            onChange={(event) => setDaysText(event.target.value)}
          />
        </Field>
        <Field className={styles.days} data-invalid={leadTimeDays === null}>
          <FieldLabel htmlFor="restock-lead-time">Lead time (days)</FieldLabel>
          <Input
            id="restock-lead-time"
            type="number"
            inputMode="numeric"
            min={dayRange.min}
            max={dayRange.max}
            value={leadTimeText}
            aria-invalid={leadTimeDays === null}
            onChange={(event) => setLeadTimeText(event.target.value)}
          />
        </Field>
        <Button
          disabled={result.isLoading || targetsLoading || !target || days === null || leadTimeDays === null}
          onClick={() => {
            if (!target || days === null || leadTimeDays === null) {
              return
            }
            void load({
              days,
              leadTimeDays,
              target:
                target.pool === "shopify" ? { pool: "shopify", locationId: target.locationId } : { pool: target.pool }
            })
          }}
        >
          {result.isLoading ? "Reading sales…" : "Suggest reorders"}
        </Button>
      </div>
      {target && (
        <p className={styles.summary}>
          Inventory last synced{" "}
          {target.observedAt ? `${target.observedAt.replace("T", " ").slice(0, 16)} UTC` : "unknown"}.{" "}
          <Link href="/inventory">Refresh inventory</Link> before ordering if counts have changed.
        </p>
      )}
      {result.isLoading && (
        <p className={styles.summary} aria-live="polite">
          Reading every order in the period. This can take a few minutes.
        </p>
      )}
      {result.isError && <p role="alert">{errorMessage(result.error, "Sales couldn't be loaded. Try again.")}</p>}
      {result.data &&
        target &&
        result.data.target?.pool === target.pool &&
        (target.pool !== "shopify" ||
          (result.data.target.pool === "shopify" && result.data.target.locationId === target.locationId)) && (
          <>
            <Notes report={result.data} />
            <Reorder report={result.data} />
            <Multipacks report={result.data} />
          </>
        )}
    </div>
  )
}
