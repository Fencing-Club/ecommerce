import { useTranslations } from "use-intl"
import { PageHeader } from "@/components/common"
import { ImportIntake } from "@/components/import-intake"
export default function ImportOrder() {
  const t = useTranslations("orders")
  return (
    <>
      <PageHeader parents={[{ label: t("index.title"), href: "/orders" }]} title={t("import.title")} />
      <ImportIntake />
    </>
  )
}
