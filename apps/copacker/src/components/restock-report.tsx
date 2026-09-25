"use client"

import { ImageOff } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api, errorMessage } from "@/lib/api"
import { salesPeriods } from "@/server/bundle-sales"
import { leadTimes } from "@/server/restock-report"
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
}
type MultipackLine = Line & { bundlesSold: number; available: number | null }
type Report = {
  days: number
  leadTimeDays: number
  unmatchedUnits: number
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
    restockReport: build.mutation<Report, { days: number; leadTimeDays: number }>({
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
      gapUnits > 0 &&
        `${sourceNames[source]}: not counted, ${Object.entries(gapReasons)
          .filter(([, gap]) => gap.units > 0)
          .map(([reason, gap]) => `${gap.units} units ${gapNames[reason] ?? reason.replaceAll("_", " ")}`)
          .join(", ")}.`
    ]),
    report.unmatchedUnits > 0 && `${report.unmatchedUnits} units sold under SKUs that don't match one Shopify product.`
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
  if (report.sources.some((source) => source.error !== null)) {
    return (
      <p className={styles.summary}>
        Restock needs sales from every connected store. Fix the issue above and try again.
      </p>
    )
  }
  if (!report.reorder.length) {
    return (
      <p className={styles.summary}>
        Nothing needs reordering to cover the next {report.leadTimeDays} days at the last {report.days} days&apos; rate.
      </p>
    )
  }
  // A PO holds up to 100 lines.
  const lines = report.reorder.slice(0, 100)
  const href = `/orders/new?${new URLSearchParams(lines.map((line) => ["variant", `${line.variantId}@${line.purchaseUnits}`]))}`
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
        what&apos;s on order. Items often sold in multipacks may be better reordered as the multipack.
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

export function RestockReport() {
  const [days, setDays] = useState<number>(salesPeriods.at(-1) ?? 56)
  const [leadTimeDays, setLeadTimeDays] = useState<number>(56)
  const [load, result] = restockApi.useRestockReportMutation({ fixedCacheKey: "restock-report" })
  return (
    <div className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
      <div className={styles.controls}>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-days">Sales period</FieldLabel>
          <NativeSelect
            id="restock-days"
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {salesPeriods.map((period) => (
              <NativeSelectOption key={period} value={String(period)}>
                Last {period} days
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className={styles.control}>
          <FieldLabel htmlFor="restock-lead-time">Lead time</FieldLabel>
          <NativeSelect
            id="restock-lead-time"
            value={String(leadTimeDays)}
            onChange={(event) => setLeadTimeDays(Number(event.target.value))}
          >
            {leadTimes.map((lead) => (
              <NativeSelectOption key={lead} value={String(lead)}>
                {lead} days
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button disabled={result.isLoading} onClick={() => void load({ days, leadTimeDays })}>
          {result.isLoading ? "Reading sales…" : "Suggest reorders"}
        </Button>
      </div>
      {result.isLoading && (
        <p className={styles.summary} aria-live="polite">
          Reading every order in the period. This can take a few minutes.
        </p>
      )}
      {result.isError && <p role="alert">{errorMessage(result.error, "Sales couldn't be loaded. Try again.")}</p>}
      {result.data && (
        <>
          <Notes report={result.data} />
          <Reorder report={result.data} />
          <Multipacks report={result.data} />
        </>
      )}
    </div>
  )
}
