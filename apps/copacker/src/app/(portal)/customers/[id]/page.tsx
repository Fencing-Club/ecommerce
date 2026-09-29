import { Globe, Mail, Phone, User } from "lucide-react"
import { getLocale, getTimeZone, getTranslations } from "next-intl/server"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { PageHeader } from "@/components/common"
import { StatCard, StatGrid } from "@/components/stat-card"
import { CatalogPicker } from "@/components/supplier/customers"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { AmountsStat } from "@/components/supplier/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { can } from "@/lib/access"
import { formatDate } from "@/lib/format"
import { formatPhone, phoneHref } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { requirePage, session, titleFor } from "@/server/auth"
import { customerDetail, withoutTotals } from "@/server/supplier-workspace"

export const generateMetadata = titleFor("supplier.pages.customer", "customers")

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  // What the customer spent and its orders' totals are left out for someone who doesn't see prices.
  const prices = can(s, "prices")
  if (s.org.kind !== "supplier") {
    redirect("/")
  }
  requirePage(s, "customers")
  const id = z.uuid().safeParse((await params).id)
  const detail = id.success ? await customerDetail(s.org.id, id.data) : null
  if (!detail) {
    notFound()
  }
  const { customer, contact, catalogs, orders } = detail
  const [t, pages, locale, timeZone] = await Promise.all([
    getTranslations("supplier.customerPage"),
    getTranslations("supplier.pages"),
    getLocale(),
    getTimeZone()
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
            <StatCard label={t("since")} value={formatDate(customer.createdAt, locale, timeZone)} />
          </StatGrid>
          {/* The customer's orders, for someone who can open them. */}
          {can(s, "orders") && (
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
              {customer.catalog && can(s, "catalogs") && (
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
