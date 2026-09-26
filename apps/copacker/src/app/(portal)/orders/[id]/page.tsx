import { money, orderTotal } from "@repo/aisle"
import { and, desc, eq } from "drizzle-orm"
import { ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import {
  DocumentList,
  EmptyState,
  PageBreadcrumb,
  PageHeader,
  Status,
  WarningNote,
  formatDestination
} from "@/components/common"
import { ClosePurchaseOrder } from "@/components/order-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload } from "@/components/upload"
import { db } from "@/db"
import { documents, events, orderRevisions, shipments } from "@/db/schema"
import { cn } from "@/lib/utils"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { orderWorkflow } from "@/server/workflow"
import { alignTop, revisionChevron, revisionTrigger } from "./page.css"
import { sx } from "@/styles/sprinkles.css"

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  const id = z.uuid().parse((await params).id)
  const { order, supplier } = await accessibleOrder(s, id)
  const [shipmentRows, docs, history, revisions] = await Promise.all([
    db().select().from(shipments).where(eq(shipments.orderId, id)),
    db()
      .select()
      .from(documents)
      .where(and(eq(documents.orderId, id), eq(documents.outdated, 0))),
    db().select().from(events).where(eq(events.orderId, id)).orderBy(desc(events.createdAt)),
    db().select().from(orderRevisions).where(eq(orderRevisions.orderId, id)).orderBy(desc(orderRevisions.revision))
  ])
  const workflow = await orderWorkflow(s, id)
  const editable = workflow.shipments.some((row) => row.editable)
  const remaining = workflow.items.some((item) => item.remainingPieces > 0)
  const { currency } = order.data
  const labels = docs.filter((d) => d.kind === "product_label" || d.kind === "purchase_order")
  // Lines the supplier can't label yet. Closed POs no longer need them.
  const unlabelled = new Set(
    order.status === "closed"
      ? []
      : order.data.items
          .filter((item) => !docs.some((doc) => doc.kind === "product_label" && doc.itemId === item.id))
          .map((item) => item.id)
  )

  return (
    <>
      <PageBreadcrumb parents={[{ label: "Purchase orders", href: "/orders" }]} current={order.data.reference} />
      <PageHeader
        title={order.data.reference}
        description={`${supplier.name} to ${formatDestination(order.data.destination)}, revision ${order.revision}`}
      >
        <Status status={order.status} />
        {order.status === "draft" && s.org.kind === "buyer" && (
          <ActionButton action="order.submit" data={{ id, revision: order.revision }}>
            Submit to supplier
          </ActionButton>
        )}
        {order.status === "submitted" && (editable || remaining) && (
          <ActionButton action="shipment.create" data={{ id }}>
            {editable ? "Continue packing" : "Prepare next shipment"}
          </ActionButton>
        )}
        {order.status === "submitted" && s.org.kind === "buyer" && (
          <ClosePurchaseOrder id={id} reference={order.data.reference} />
        )}
      </PageHeader>

      <div className={sx({ display: "grid", gap: 6, gridTemplateColumns: { base: "1", xl: "mainAside" } })}>
        <div className={sx({ display: "flex", minWidth: 0, flexDirection: "column", gap: 6 })}>
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Pieces</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Pack size</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Price per piece</TableHead>
                    <TableHead className={sx({ textAlign: "right" })}>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.data.items.map((item) => (
                    <TableRow key={item.id} className={alignTop}>
                      <TableCell className={sx({ whiteSpace: "normal" })}>
                        <p className={sx({ fontWeight: "medium" })}>{item.name}</p>
                        <p className={sx({ color: "muted" })}>{item.variant}</p>
                        <p className={sx({ marginTop: 1, text: "xs", color: "muted" })}>Buyer SKU: {item.buyerSku}</p>
                        <p className={sx({ text: "xs", color: "muted" })}>
                          Supplier SKU: {item.supplierSku || "Not provided"}
                        </p>
                        {unlabelled.has(item.id) && (
                          <WarningNote className={sx({ marginTop: 1 })}>
                            {s.org.kind === "buyer"
                              ? "No product label. Upload one below, or add a barcode on the Products page for future POs."
                              : "The buyer hasn’t added a product label yet."}
                          </WarningNote>
                        )}
                        {item.instructions && (
                          <p
                            className={sx({
                              marginTop: 2,
                              maxWidth: "sm",
                              text: "xs",
                              whiteSpace: "pre-line",
                              color: "muted"
                            })}
                          >
                            {item.instructions}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {item.pieces}
                        <p className={sx({ text: "xs", color: "muted" })}>
                          {workflow.items.find((row) => row.itemId === item.id)?.remainingPieces} remaining
                        </p>
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {item.piecesPerSet}
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {money(item.unitPrice, currency)}
                      </TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {money(item.pieces * item.unitPrice, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  {!!order.data.adjustments?.length && (
                    <TableRow>
                      <TableCell colSpan={4}>Products subtotal</TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {money(
                          order.data.items.reduce((sum, item) => sum + item.pieces * item.unitPrice, 0),
                          currency
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  {order.data.adjustments?.map((adjustment, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={4}>{adjustment.description}</TableCell>
                      <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                        {money(adjustment.amount, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4}>PO total</TableCell>
                    <TableCell className={sx({ textAlign: "right", fontVariantNumeric: "tabular" })}>
                      {money(orderTotal(order.data), currency)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipments</CardTitle>
            </CardHeader>
            <CardContent>
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
                <EmptyState
                  title="No shipments yet"
                  description="Once this PO is submitted, the supplier can upload an invoice and prepare the first shipment."
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Product labels</CardTitle>
            </CardHeader>
            <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
              {s.org.kind === "buyer" && <Upload orderId={id} kind="product_label" items={order.data.items} />}
              {labels.length > 0 && <DocumentList documents={labels} />}
            </CardContent>
          </Card>
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
                <Info label="Supplier" value={supplier.name} />
                <Info label="Required date" value={order.data.dueDate} />
                <Info label="Currency" value={currency} />
                <Info label="Quantity" value={`${order.data.items.reduce((n, i) => n + i.pieces, 0)} pieces`} />
              </dl>
              {order.data.notes && (
                <>
                  <Separator />
                  <p className={sx({ text: "sm", whiteSpace: "pre-line", color: "muted" })}>{order.data.notes}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <ol className={sx({ display: "flex", flexDirection: "column", gap: 4 })}>
                  {history.map((event) => (
                    <li key={event.id} className={sx({ display: "flex", flexDirection: "column", gap: 0.5 })}>
                      <p className={sx({ text: "sm" })}>{event.message}</p>
                      <time className={sx({ text: "xs", color: "muted" })} dateTime={event.createdAt.toISOString()}>
                        {event.createdAt.toLocaleDateString("en-US")}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={sx({ text: "sm", color: "muted" })}>Your order activity will appear here.</p>
              )}
            </CardContent>
          </Card>

          {revisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PO history</CardTitle>
              </CardHeader>
              <CardContent className={sx({ display: "flex", flexDirection: "column", gap: 2 })}>
                {revisions.map((r) => (
                  <Collapsible key={r.id}>
                    <CollapsibleTrigger className={revisionTrigger}>
                      Revision {r.revision}: {r.reason}
                      <ChevronDown className={cn(sx({ size: 4, flexShrink: 0, color: "muted" }), revisionChevron)} />
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
                        {r.data.items.map((i) => (
                          <li key={i.id}>
                            {i.buyerSku}: {i.pieces} pieces at {money(i.unitPrice, r.data.currency)}, supplier SKU{" "}
                            {i.supplierSku || "not provided"}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={sx({ color: "muted" })}>{label}</dt>
      <dd className={sx({ textAlign: "right", fontWeight: "medium" })}>{value}</dd>
    </>
  )
}
