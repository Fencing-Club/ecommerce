import { Card, CardContent, CardHeader, CardTitle } from "@buildkitgg/shadcn-baseui-kit"
import { Link } from "@tanstack/react-router"
import { Globe, Mail, Phone, User } from "lucide-react"
import { useTranslations } from "use-intl"
import { useLocale, useTimeZone } from "use-intl"
import { formatDate } from "@/lib/format"
import { formatPhone, phoneHref } from "@/lib/phone"
import { cn } from "@/lib/utils"
import type { customerPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { StatCard, StatGrid } from "./stat-card"
import { CatalogPicker } from "./supplier/customers"
import { SupplierOrderIndex } from "./supplier/order-index"
import { AmountsStat } from "./supplier/shared"

export function CustomerPageView({
  customer,
  contact,
  catalogs,
  orders,
  prices,
  showOrders,
  openCatalog
}: NonNullable<Awaited<ReturnType<typeof customerPageData>>>) {
  const t = useTranslations("supplier.customerPage")
  const pages = useTranslations("supplier.pages")
  const locale = useLocale()
  const timeZone = useTimeZone()
  const contactRows = [
    { icon: User, value: contact.name },
    { icon: Mail, value: contact.email, href: contact.email ? `mailto:${contact.email}` : null },
    {
      icon: Phone,
      value: contact.phone ? formatPhone(contact.phone) : null,
      href: contact.phone ? phoneHref(contact.phone) : null,
      phone: true
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
          {showOrders && <SupplierOrderIndex orders={orders} showCustomer={false} />}
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
              {customer.catalog && openCatalog && (
                <Link
                  to="/catalogs/$id"
                  params={{ id: customer.catalog.id }}
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
                        <a
                          href={row.href}
                          dir={row.phone ? "ltr" : undefined}
                          className={cn("truncate hover:underline", row.phone && "tabular-nums")}
                        >
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
