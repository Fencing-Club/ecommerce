import { money, orderTotal } from "@repo/aisle"
import { and, desc, eq } from "drizzle-orm"
import { ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { z } from "zod"
import { ActionButton } from "@/components/actions"
import { DocumentList, EmptyState, PageBreadcrumb, PageHeader, Status, formatDestination } from "@/components/common"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Upload } from "@/components/upload"
import { db } from "@/db"
import { documents, events, orderRevisions, shipments } from "@/db/schema"
import { accessibleOrder } from "@/server/access"
import { session } from "@/server/auth"
import { orderWorkflow } from "@/server/workflow"

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
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Products</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Pieces</TableHead>
                    <TableHead className="text-right">Pack size</TableHead>
                    <TableHead className="text-right">Price per piece</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.data.items.map((item) => (
                    <TableRow key={item.id} className="align-top">
                      <TableCell className="whitespace-normal">
                        <p className="font-medium">{item.name}</p>
                        <p className="text-muted-foreground">{item.variant}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Buyer SKU: {item.buyerSku}</p>
                        <p className="text-xs text-muted-foreground">
                          Supplier SKU: {item.supplierSku || "Not provided"}
                        </p>
                        {item.instructions && (
                          <p className="mt-2 max-w-sm text-xs whitespace-pre-line text-muted-foreground">
                            {item.instructions}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.pieces}
                        <p className="text-xs text-muted-foreground">
                          {workflow.items.find((row) => row.itemId === item.id)?.remainingPieces} remaining
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.piecesPerSet}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(item.unitPrice, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(item.pieces * item.unitPrice, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>PO total</TableCell>
                    <TableCell className="text-right tabular-nums">{money(orderTotal(order.data), currency)}</TableCell>
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
                <ItemGroup className="gap-2">
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
                        <ChevronRight className="size-4 text-muted-foreground" />
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
            <CardContent className="flex flex-col gap-4">
              {s.org.kind === "buyer" && <Upload orderId={id} kind="product_label" items={order.data.items} />}
              {labels.length > 0 && <DocumentList documents={labels} />}
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Order overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <Info label="Supplier" value={supplier.name} />
                <Info label="Required date" value={order.data.dueDate} />
                <Info label="Currency" value={currency} />
                <Info label="Quantity" value={`${order.data.items.reduce((n, i) => n + i.pieces, 0)} pieces`} />
              </dl>
              {order.data.notes && (
                <>
                  <Separator />
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{order.data.notes}</p>
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
                <ol className="flex flex-col gap-4">
                  {history.map((event) => (
                    <li key={event.id} className="flex flex-col gap-0.5">
                      <p className="text-sm">{event.message}</p>
                      <time className="text-xs text-muted-foreground" dateTime={event.createdAt.toISOString()}>
                        {event.createdAt.toLocaleDateString("en-US")}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Your order activity will appear here.</p>
              )}
            </CardContent>
          </Card>

          {revisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PO history</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {revisions.map((r) => (
                  <Collapsible key={r.id}>
                    <CollapsibleTrigger className="group/trigger flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      Revision {r.revision}: {r.reason}
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open/trigger:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="flex flex-col gap-1 py-2 text-xs text-muted-foreground">
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
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  )
}
