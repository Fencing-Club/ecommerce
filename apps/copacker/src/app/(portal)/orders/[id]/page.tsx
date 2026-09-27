import { money, type OrderItem, orderTotal } from "@repo/aisle"
import { destinationRequirements, itemRequirements, prepInstructions, sharedPrep } from "@repo/aisle/requirements"
import { desc, eq } from "drizzle-orm"
import { ChevronDown, ChevronRight, Info as InfoIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { PageBreadcrumb, PageHeader, Status, WarningNote, formatDestination } from "@/components/common"
import { LandedCostForm } from "@/components/landed-costs"
import { LineLabel, OrderMenu } from "@/components/order-actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { db } from "@/db"
import { events, orderRevisions, shipments } from "@/db/schema"
import { cn } from "@/lib/utils"
import { accessibleOrder } from "@/server/access"
import { amazonFreightByOrder } from "@/server/amazon-shipments"
import { session } from "@/server/auth"
import { landedCostKinds, landedMarkup, orderLandedCosts } from "@/server/landed-costs"
import { lineLabels } from "@/server/product-barcodes"
import { orderWorkflow } from "@/server/workflow"
import { alignTop, revisionChevron, revisionTrigger } from "./page.css"
import { sx } from "@/styles/sprinkles.css"
import { srOnly } from "@/styles/utilities.css"

export const metadata: Metadata = { title: "Purchase order" }

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  const id = z.uuid().parse((await params).id)
  const { order, supplier } = await accessibleOrder(s, id)
  const [shipmentRows, history, revisions] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, id)),
    db().select().from(events).where(eq(events.orderId, id)).orderBy(desc(events.createdAt)),
    db().select().from(orderRevisions).where(eq(orderRevisions.orderId, id)).orderBy(desc(orderRevisions.revision))
  ])
  const workflow = await orderWorkflow(s, id)
  const remainingFor = (itemId: string) => workflow.items.find((row) => row.itemId === itemId)?.remainingPieces
  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const [landed, freight] =
    s.org.kind === "buyer"
      ? await Promise.all([
          orderLandedCosts(id),
          amazonFreightByOrder(s.org.id).then((rows) =>
            rows.filter((row) => row.orderId === id && row.currency === currency)
          )
        ])
      : [[], []]
  // Amazon's freight for this PO's shipments counts with the costs recorded here.
  const landedTotal =
    landed.reduce((sum, cost) => sum + cost.amountMinor, 0) + freight.reduce((sum, row) => sum + row.freightMinor, 0)
  const markup = landedMarkup(order.data, landedTotal)
  const buyer = s.org.kind === "buyer"
  // Each line's label, from its product's current barcode and label setting.
  const labels = await lineLabels(order)
  const labelFor = (itemId: string) => labels.find((label) => label.itemId === itemId)
  // What happened to the PO, newest first: its events, and each revision, which opens to show its lines.
  const timeline = [
    ...history.map((event) => ({ key: event.id, at: event.createdAt, message: event.message, revision: null })),
    ...revisions.map((r) => ({
      key: r.id,
      at: r.createdAt,
      message: r.revision === 1 ? r.reason : `Revision ${r.revision}: ${r.reason}`,
      revision: r.data
    }))
  ].toSorted((a, b) => b.at.getTime() - a.at.getTime())
  const prep = sharedPrep(order.data)
  const instructions = [
    ...(prep ? [`${prepInstructions[prep]}.`] : []),
    ...destinationRequirements(order.data.destination)
  ]

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current={order.data.reference} />
      <PageHeader
        title={order.data.reference}
        description={`${supplier.name} to ${formatDestination(order.data.destination)}, revision ${order.revision}`}
      >
        {order.status === "draft" && buyer && (
          <ActionButton action="order.submit" data={{ id, revision: order.revision }}>
            {supplier.supplierOrgId ? "Submit to supplier" : "Send PO"}
          </ActionButton>
        )}
        {order.status === "submitted" && (editable || remaining) && (
          <ActionButton action="shipment.create" data={{ id }}>
            {editable ? "Continue packing" : "Prepare next shipment"}
          </ActionButton>
        )}
        <OrderMenu
          id={id}
          reference={order.data.reference}
          draft={order.status === "draft" && buyer}
          closable={order.status === "submitted" && buyer}
          labels={labels.some((label) => label.state === "uploaded" || label.state === "standard")}
        />
      </PageHeader>

      {s.org.kind === "buyer" && !supplier.supplierOrgId && (
        <Alert>
          <InfoIcon />
          <AlertTitle>{supplier.name} isn’t on Copacker</AlertTitle>
          <AlertDescription>
            Email them the PO yourself, then enter their cartons and invoice on the shipment.
          </AlertDescription>
        </Alert>
      )}

      <div className={sx({ display: "grid", gap: 6, gridTemplateColumns: { base: "1", xl: "mainAside" } })}>
        <div className={sx({ display: "flex", minWidth: 0, flexDirection: "column", gap: 6 })}>
          <section aria-labelledby="products" className={sx({ display: "flex", flexDirection: "column", gap: 3 })}>
            <h2 id="products" className={sx({ text: "lg", fontWeight: "semibold" })}>
              Products
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Supplier SKU</TableHead>
                  <TableHead className={sx({ textAlign: "right" })}>Units</TableHead>
                  <TableHead className={sx({ textAlign: "right" })}>Price</TableHead>
                  <TableHead className={sx({ textAlign: "right" })}>Total</TableHead>
                  <TableHead>
                    <span className={srOnly}>Label</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.data.items.map((item) => (
                  <TableRow key={item.id} className={alignTop}>
                    <TableCell className={sx({ whiteSpace: "normal" })}>
                      <p className={sx({ fontWeight: "medium" })}>{item.name}</p>
                      {item.variant !== "Default Title" && <p className={sx({ color: "muted" })}>{item.variant}</p>}
                      <p className={sx({ marginTop: 1, text: "xs", color: "muted" })}>SKU {item.buyerSku}</p>
                      {itemRequirements(item, order.data.destination, prep).map((line) => (
                        <p key={line} className={sx({ text: "xs", color: "muted" })}>
                          {line}
                        </p>
                      ))}
                    </TableCell>
                    <TableCell className={sx({ whiteSpace: "normal" })}>
                      <SupplierSku item={item} />
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {item.pieces}
                      {item.piecesPerSet > 1 && (
                        <p className={sx({ text: "xs", color: "muted" })}>{item.piecesPerSet} per pack</p>
                      )}
                      {remainingFor(item.id) !== item.pieces && (
                        <p className={sx({ text: "xs", color: "muted" })}>{remainingFor(item.id)} to ship</p>
                      )}
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {money(item.unitPrice, currency)}
                    </TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {money(item.pieces * item.unitPrice, currency)}
                    </TableCell>
                    <TableCell>
                      <LineLabel
                        orderId={id}
                        itemId={item.id}
                        name={[item.name, item.variant === "Default Title" ? "" : item.variant]
                          .filter(Boolean)
                          .join(" / ")}
                        label={labelFor(item.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {!!order.data.adjustments?.length && (
                  <TableRow>
                    <TableCell colSpan={4}>Subtotal</TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {money(
                        order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0),
                        currency
                      )}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
                {order.data.adjustments?.map((adjustment, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={4}>{adjustment.description}</TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {money(adjustment.amount, currency)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                    {money(orderTotal(order.data), currency)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </section>

          {(instructions.length > 0 || order.data.notes) && (
            <section
              aria-labelledby="instructions"
              className={sx({ display: "flex", flexDirection: "column", gap: 3 })}
            >
              <h2 id="instructions" className={sx({ text: "lg", fontWeight: "semibold" })}>
                Instructions
              </h2>
              {instructions.length > 0 && (
                <ul className={sx({ display: "flex", flexDirection: "column", gap: 1, text: "sm" })}>
                  {instructions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {order.data.notes && (
                <p className={sx({ text: "sm", whiteSpace: "pre-line", color: "muted" })}>{order.data.notes}</p>
              )}
            </section>
          )}

          <section aria-labelledby="shipments" className={sx({ display: "flex", flexDirection: "column", gap: 3 })}>
            <h2 id="shipments" className={sx({ text: "lg", fontWeight: "semibold" })}>
              Shipments
            </h2>
            {shipmentRows.length ? (
              <ItemGroup className={sx({ gap: 2 })}>
                {shipmentRows.map((shipment, index) => (
                  <Item key={shipment.id} variant="outline" render={<Link href={`/shipments/${shipment.id}`} />}>
                    <ItemContent>
                      <ItemTitle>Shipment {index + 1}</ItemTitle>
                      <ItemDescription>
                        {shipment.amazonShipmentId ?? "Cartons in preparation"},{" "}
                        {shipment.packingDraft?.cartons?.length ?? shipment.packing?.cartons.length ?? 0} cartons
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Status status={shipment.status} />
                      <ChevronRight className={sx({ size: 4, color: "muted" })} />
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            ) : (
              <p className={sx({ text: "sm", color: "muted" })}>
                {order.status === "draft" ? "Shipments start once the PO is sent." : "No shipments yet."}
              </p>
            )}
          </section>
        </div>

        <aside className={sx({ display: "flex", flexDirection: "column", gap: 6 })}>
          <Card>
            <CardHeader>
              <CardTitle>Order overview</CardTitle>
            </CardHeader>
            <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
              <dl
                className={sx({
                  display: "grid",
                  gridTemplateColumns: "labelValue",
                  columnGap: 4,
                  rowGap: 3,
                  text: "sm"
                })}
              >
                <dt className={sx({ color: "muted" })}>Status</dt>
                <dd className={sx({ display: "flex", justifyContent: "flex-end" })}>
                  <Status status={order.status} />
                </dd>
                <Info label="Supplier" value={supplier.name} />
                <Info label="Required date" value={order.data.dueDate} />
                <Info label="Payment terms" value={order.data.paymentTerms || "Not set"} />
                <Info label="Currency" value={currency} />
                <Info label="Units" value={String(order.data.items.reduce((n, i) => n + i.pieces, 0))} />
              </dl>
            </CardContent>
          </Card>

          {s.org.kind === "buyer" && (
            <Card>
              <CardHeader>
                <CardTitle>Landed costs</CardTitle>
                <CardDescription>
                  Freight, duty and other costs of getting these goods to you. Only your team sees them. The Overview
                  adds them to your products’ unit costs. Freight Amazon charges for this PO’s shipments is added
                  automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
                {landed.length + freight.length > 0 && (
                  <ul className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                    {freight.map((row) => (
                      <li
                        key={row.reference}
                        className={sx({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 3
                        })}
                      >
                        <span className={sx({ display: "flex", flexDirection: "column", minWidth: 0 })}>
                          <span className={sx({ text: "sm", fontWeight: "medium" })}>Amazon inbound freight</span>
                          <span className={sx({ text: "xs", color: "muted" })}>
                            Shipment {row.reference}, from Amazon’s charges
                          </span>
                        </span>
                        <span className={sx({ text: "sm", fontVariantNumeric: "tabular" })}>
                          {money(row.freightMinor, currency)}
                        </span>
                      </li>
                    ))}
                    {landed.map((cost) => (
                      <li
                        key={cost.id}
                        className={sx({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 3
                        })}
                      >
                        <span className={sx({ display: "flex", flexDirection: "column", minWidth: 0 })}>
                          <span className={sx({ text: "sm", fontWeight: "medium" })}>{landedCostKinds[cost.kind]}</span>
                          {cost.description && (
                            <span className={sx({ text: "xs", color: "muted" })}>{cost.description}</span>
                          )}
                        </span>
                        <span className={sx({ display: "flex", alignItems: "center", gap: 3 })}>
                          <span className={sx({ text: "sm", fontVariantNumeric: "tabular" })}>
                            {money(cost.amountMinor, currency)}
                          </span>
                          <ActionButton action="landedCost.delete" data={{ id: cost.id }} variant="outline" size="sm">
                            Remove<span className={srOnly}> {landedCostKinds[cost.kind].toLowerCase()} cost</span>
                          </ActionButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <dl
                  className={sx({
                    display: "grid",
                    gridTemplateColumns: "labelValue",
                    columnGap: 4,
                    rowGap: 2,
                    text: "sm"
                  })}
                >
                  <Info label="Supplier total" value={money(orderTotal(order.data), currency)} />
                  <Info label="Landed costs" value={money(landedTotal, currency)} />
                  <Info label="Landed total" value={money(orderTotal(order.data) + landedTotal, currency)} />
                  {markup !== null && landedTotal > 0 && (
                    <Info
                      label="Markup"
                      value={`${new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(markup)} on product cost`}
                    />
                  )}
                </dl>
                <Separator />
                <LandedCostForm orderId={id} currency={currency} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
                {timeline.map((entry) => (
                  <li key={entry.key} className={sx({ display: "flex", flexDirection: "column", gap: 0.5 })}>
                    {entry.revision ? (
                      <Collapsible>
                        <CollapsibleTrigger className={revisionTrigger}>
                          {entry.message}
                          <ChevronDown
                            className={cn(sx({ size: 4, flexShrink: 0, color: "muted" }), revisionChevron)}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul
                            className={sx({
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                              paddingY: 2,
                              text: "xs",
                              color: "muted"
                            })}
                          >
                            {entry.revision.items.map((i) => (
                              <li key={i.id}>
                                {i.buyerSku}: {i.pieces} units at {money(i.unitPrice, entry.revision.currency)}
                                {i.supplierSku && `, supplier SKU ${i.supplierSku}`}
                              </li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      <p className={sx({ text: "sm" })}>{entry.message}</p>
                    )}
                    <time className={sx({ text: "xs", color: "muted" })} dateTime={entry.at.toISOString()}>
                      {entry.at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  )
}

// A line's supplier SKU, or each component's for a bundle, so the supplier knows what to make.
function SupplierSku({ item }: { item: OrderItem }) {
  if (item.components?.length) {
    return item.components.map((component) => (
      <p key={component.variantId}>
        {component.quantity} × {component.supplierSku || component.buyerSku || "Not set"}
      </p>
    ))
  }
  return item.supplierSku || <WarningNote>Not set</WarningNote>
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={sx({ color: "muted" })}>{label}</dt>
      <dd className={sx({ textAlign: "right", fontWeight: "medium" })}>{value}</dd>
    </>
  )
}
