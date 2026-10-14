import { Globe, Mail, Phone, User } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { PageHeader } from "@/components/common"
import { StatCard, StatGrid } from "@/components/stat-card"
import { CatalogPicker } from "@/components/supplier/customers"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { AmountsStat } from "@/components/supplier/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { can, type Permissions } from "@/lib/access"
import { formatDate } from "@/lib/format"
import { formatPhone, phoneHref } from "@/lib/phone"
import { cn } from "@/lib/utils"
import type { ListedOrder, SupplierOrder } from "@/server/supplier-workspace"
import { catalogIds, customerIds, customerRows, harborDetail } from "@/stories/fixtures/supplier"
import { pageStory } from "@/stories/server"
import { owner } from "@/stories/workspace"

// withoutTotals from the server's supplier-workspace, which reads the database and can't load in a story.
function withoutTotals(list: SupplierOrder[]): ListedOrder[] {
  return list.map((order) => ({ ...order, total: null }))
}

// A customer's page (page.tsx) with the customer, contact, catalogs and orders the database would return.
async function CustomerPage({ detail, permissions }: { detail: typeof harborDetail; permissions: Permissions }) {
  // What the customer spent and its orders' totals are left out for someone who doesn't see prices.
  const prices = can(permissions, "prices")
  const { customer, contact, catalogs, orders } = detail
  const [t, pages, locale] = await Promise.all([
    getTranslations("supplier.customerPage"),
    getTranslations("supplier.pages"),
    getLocale()
  ])
  // The phone reads grouped, as +1 (425) 260-2501, and dials as saved.
  const contactRows = [
    { icon: User, value: contact.name },
    { icon: Mail, value: contact.email, href: contact.email ? `mailto:${contact.email}` : null },
    {
      icon: Phone,
      value: contact.phone ? formatPhone(contact.phone) : null,
      href: contact.phone ? phoneHref(contact.phone) : null,
      numeric: true
    },
    { icon: Globe, value: contact.website, href: contact.website }
  ].filter((row) => row.value)

  return (
    <>
      <PageHeader parents={[{ label: pages("customers"), href: "/customers" }]} title={customer.name} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <StatGrid>
            {prices && <AmountsStat label={t("spent")} amounts={customer.spent} />}
            <StatCard label={t("orders")} value={customer.orders.toLocaleString(locale)} />
            <StatCard label={t("since")} value={formatDate(customer.createdAt, locale)} />
          </StatGrid>
          {/* The customer's orders, for someone who can open them. */}
          {can(permissions, "orders") && (
            <SupplierOrderIndex orders={prices ? orders : withoutTotals(orders)} showCustomer={false} />
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("catalog")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <CatalogPicker
                customerId={customer.id}
                customer={customer.name}
                catalogs={catalogs}
                value={customer.catalogId}
                hint
              />
              {customer.catalog && can(permissions, "catalogs") && (
                <Link
                  href={`/catalogs/${customer.catalog.id}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {t("openCatalog", { title: customer.catalog.title })}
                </Link>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("contact")}</CardTitle>
            </CardHeader>
            <CardContent>
              {contactRows.length ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {contactRows.map((row) => (
                    <li key={row.value} className="flex items-center gap-2">
                      <row.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      {row.href ? (
                        <a href={row.href} className={cn("truncate hover:underline", row.numeric && "tabular-nums")}>
                          {row.value}
                        </a>
                      ) : (
                        <span className="truncate">{row.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noContact")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

const meta = preview.meta({
  title: "Pages/Supplier/Customers/Detail",
  ...pageStory(`/customers/${customerIds.harbor}`, CustomerPage, "supplier"),
  args: { detail: harborDetail, permissions: owner }
})

const card = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getByText(title).closest("[data-slot=card]")!)

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Harbor Goods" })).toBeVisible()
    // The figures are the app's stat cards: the first currency spent, the others named beneath.
    const spent = card(canvas, "Amount spent")
    await expect(spent.getByText("$12,840.00")).toBeVisible()
    await expect(spent.getByText("Plus €960.00")).toBeVisible()
    // Each figure has its own card.
    await expect(canvas.getByText("6").closest("[data-slot=card]")).toHaveTextContent("Orders6")
    // Its orders, without a customer column.
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Customer" })).toBeNull()
    await expect(canvas.getByRole("columnheader", { name: "Total" })).toBeVisible()
    const catalog = card(canvas, "Catalog")
    await expect(catalog.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toHaveTextContent(
      "Wholesale 2026"
    )
    await expect(catalog.getByRole("link", { name: "Open Wholesale 2026" })).toHaveAttribute(
      "href",
      `/catalogs/${catalogIds.wholesale}`
    )
    const contact = card(canvas, "Contact")
    await expect(contact.getByText("Jordan Lee")).toBeVisible()
    await expect(contact.getByRole("link", { name: "jordan@example.com" })).toHaveAttribute(
      "href",
      "mailto:jordan@example.com"
    )
    await expect(contact.getByRole("link", { name: "+1 (425) 260-2501" })).toHaveAttribute("href", "tel:+14252602501")
    await expect(contact.getByRole("link", { name: "https://harbor.example.com" })).toHaveAttribute(
      "href",
      "https://harbor.example.com"
    )
  }
})

// A new customer without a catalog, contact details or orders.
export const NewCustomer = meta.story({
  args: {
    detail: {
      customer: customerRows[0]!,
      contact: { name: null, email: null, phone: null, website: null },
      catalogs: harborDetail.catalogs,
      orders: []
    }
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Bluebird Home" })).toBeVisible()
    const catalog = card(canvas, "Catalog")
    await expect(catalog.getByRole("combobox")).toHaveTextContent("No catalog")
    await expect(catalog.getByText("All products at list prices")).toBeVisible()
    await expect(catalog.queryByRole("link")).toBeNull()
    await expect(canvas.getByText("No contact details")).toBeVisible()
    await expect(canvas.getByText("No orders yet")).toBeVisible()
    await expect(card(canvas, "Amount spent").getByText("—")).toBeVisible()
  }
})

// A member who views customers, without prices, orders or catalogs: what's left is the customer and its catalog.
const customerViewer: Permissions = { role: "member", access: { customers: "view" } }

export const Member = meta.story({
  args: { permissions: customerViewer },
  parameters: { permissions: customerViewer },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Amount spent")).toBeNull()
    await expect(canvas.getByText("Customer since")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "PO-2051" })).toBeNull()
    await expect(canvas.getByRole("combobox", { name: "Catalog for Harbor Goods" })).toBeDisabled()
    await expect(canvas.queryByRole("link", { name: "Open Wholesale 2026" })).toBeNull()
  }
})

// A member who opens orders without prices sees them without totals.
const orderViewer: Permissions = { role: "member", access: { customers: "view", orders: "view" } }

export const MemberWithOrders = meta.story({
  args: { permissions: orderViewer },
  parameters: { permissions: orderViewer },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "PO-2051" })).toBeVisible()
    await expect(canvas.queryByRole("columnheader", { name: "Total" })).toBeNull()
  }
})
