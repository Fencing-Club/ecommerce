"use client"

import { useTranslations } from "use-intl"
import type { customersPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { CustomerIndex } from "./supplier/customers"

export function CustomersPageView({ customers, catalogs }: Awaited<ReturnType<typeof customersPageData>>) {
  const t = useTranslations("supplier.pages")
  return (
    <>
      <PageHeader title={t("customers")} />
      <CustomerIndex customers={customers} catalogs={catalogs} />
    </>
  )
}
