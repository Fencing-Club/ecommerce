import { CheckCircle2, Truck } from "lucide-react"
import { PageHeader, StatCard, StatGrid, Status } from "@/components/common"
import { Shell } from "@/components/shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const titles: Record<string, string> = {
  orders: "Purchase orders",
  shipments: "Shipments",
  suppliers: "Suppliers",
  settings: "Workspace settings"
}

const rows = [
  {
    reference: "PO-037",
    products: "Body cords and mask wires",
    supplier: "Ok Fencing",
    destination: "AWD USA",
    status: "submitted",
    value: "$7,840.00",
    pieces: "3,120 pieces"
  },
  {
    reference: "PO-036",
    products: "Competition gloves",
    supplier: "Sample supplier",
    destination: "AWD USA",
    status: "draft",
    value: "$4,320.00",
    pieces: "720 pieces"
  }
]

const steps = ["Buyer submits PO", "Supplier packs cartons", "Buyer adds shipping labels", "Supplier prints and ships"]

export default async function Preview({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view ?? "orders"

  return (
    <Shell
      name="Fencing Club"
      email="Workspace preview"
      kind="buyer"
      active="preview"
      workspaces={[]}
      view={view}
      preview
    >
      <PageHeader title={titles[view] ?? titles.orders!} description="Less back and forth. More ready to ship." />

      <StatGrid>
        <StatCard label="Open orders" value="2" caption="Your next shipments, in motion" />
        <StatCard label="Waiting on you" value="1" caption="Shipping labels are needed" />
        <StatCard label="Ready for pickup" value="0" caption="Every carton accounted for" />
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{view === "shipments" ? "Current shipments" : "Recent purchase orders"}</CardTitle>
            <CardDescription>Sample data</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase order</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.reference}>
                    <TableCell>
                      <p className="font-medium">{row.reference}</p>
                      <p className="text-xs text-muted-foreground">{row.products}</p>
                    </TableCell>
                    <TableCell>
                      <p>{row.supplier}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.pieces} to {row.destination}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Status status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            One destination per purchase order. Partial shipments welcome.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="size-4 text-primary" />
              Up next
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Item variant="muted" className="flex-col items-start">
              <Status status="waiting_labels" />
              <ItemContent>
                <ItemTitle>Body cords to AWD USA</ItemTitle>
                <ItemDescription className="line-clamp-none">
                  The supplier submitted 16 cartons. Book transportation in Amazon, then add shipping labels to release
                  the packet.
                </ItemDescription>
              </ItemContent>
            </Item>
            <ul className="flex flex-col gap-3">
              {["Official invoice uploaded", "Carton contents validated", "Amazon carton labels matched"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>A clear path from PO to pickup</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-4 sm:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="tabular-nums">
                  {index + 1}
                </Badge>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </Shell>
  )
}
