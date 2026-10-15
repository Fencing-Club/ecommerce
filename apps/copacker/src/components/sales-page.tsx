"use client"

import { useTranslations } from "use-intl"
import type { salesPageData } from "@/server/workspace-pages"
import { PageHeader } from "./common"
import { SalesOrders } from "./sales-orders"

export function SalesPageView({ search }: ReturnType<typeof salesPageData>) {
  const t = useTranslations("sales")
  return (
    <>
      <PageHeader title={t("title")} />
      <SalesOrders initialSearch={search} />
    </>
  )
}
