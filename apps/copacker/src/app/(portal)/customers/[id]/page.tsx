import { Globe, Mail, Phone, User } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { z } from "zod"
import { PageHeader } from "@/components/common"
import { CatalogPicker } from "@/components/supplier/customers"
import { SupplierOrderIndex } from "@/components/supplier/order-index"
import { Amounts } from "@/components/supplier/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { can } from "@/lib/access"
import { formatDate } from "@/lib/format"
import { formatPhone, phoneHref } from "@/lib/phone"
import { cn } from "@/lib/utils"
import { requirePage, session } from "@/server/auth"
import { customerDetail } from "@/server/supplier-workspace"

export const metadata: Metadata = { title: "Customer" }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await session()
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
      <PageHeader parents={[{ label: "Customers", href: "/customers" }]} title={customer.name} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card size="sm">
            <CardContent className="grid grid-cols-3 divide-x text-sm">
              <div className="pr-3">
                <p className="text-muted-foreground">Amount spent</p>
                <p className="mt-1 text-lg font-semibold">
                  <Amounts amounts={customer.spent} />
                </p>
              </div>
              <div className="px-3">
                <p className="text-muted-foreground">Orders</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{customer.orders}</p>
              </div>
              <div className="pl-3">
                <p className="text-muted-foreground">Customer since</p>
                <p className="mt-1 text-lg font-semibold">{formatDate(customer.createdAt)}</p>
              </div>
            </CardContent>
          </Card>
          {/* The customer's orders, for someone who can open them. */}
          {can(s, "orders") && <SupplierOrderIndex orders={orders} showCustomer={false} />}
        </div>
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Catalog</CardTitle>
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
                  Open {customer.catalog.title}
                </Link>
              )}
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Contact</CardTitle>
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
                <p className="text-sm text-muted-foreground">No contact details</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
