import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requireBuyer, requirePage, session, titleFor } from "@/server/auth"

export const generateMetadata = titleFor("orders.import.title", "orders", "edit")

export default async function ImportOrder() {
  const [s, t] = await Promise.all([session(), getTranslations("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  return (
    <>
      <PageHeader parents={[{ label: t("index.title"), href: "/orders" }]} title={t("import.title")} />
      <ImportIntake />
    </>
  )
}
