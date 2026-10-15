import { getTranslations } from "next-intl/server"
import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
import { requirePage, session, titleFor } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { withRequest } from "@/server/next-request"

export const generateMetadata = titleFor("orders.import.title", "orders", "edit")

export default withRequest(async function ImportOrder() {
  const [s, t] = await Promise.all([session(), getTranslations("orders")])
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  return (
    <>
      <PageHeader parents={[{ label: t("index.title"), href: "/orders" }]} title={t("import.title")} />
      <ImportIntake />
    </>
  )
})
