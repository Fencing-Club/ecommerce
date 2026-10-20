import { Toast } from "@base-ui/react/toast"
import { useLocalStorage } from "@mantine/hooks"
import { useState } from "react"
import { useLocale, useTranslations } from "use-intl"
import {
  documentSettingsForLocale,
  documentSettingsSchema,
  shippingPdfFilename,
  shippingSettingsKey
} from "@/documents/shipping-model"
import { useLazyPackingListQuery } from "@/lib/api"
import { useErrorMessage } from "./use-error-text"

// A packed shipment's packing list, rendered here from the cartons the server sends, in the language and paper last
// chosen for shipping documents.
export function usePackingListDownload(id: string) {
  const t = useTranslations("shipments.detail.documents")
  const locale = useLocale()
  const toast = Toast.useToastManager()
  const errorText = useErrorMessage()
  const [loadPackingList] = useLazyPackingListQuery()
  const [storedSettings] = useLocalStorage<unknown>({ key: shippingSettingsKey })
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true)
    try {
      const saved = documentSettingsSchema.safeParse(storedSettings)
      const settings = saved.success ? saved.data : documentSettingsForLocale(locale)
      const { data } = await loadPackingList(id).unwrap()
      const { ShippingPdf, renderShippingDocument } = await import("@/documents/shipping-pdf")
      const blob = await renderShippingDocument(
        <ShippingPdf data={data} kind="packing" settings={settings} packingRecord />
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = shippingPdfFilename(data, "packing", settings)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      // A refused request says why, such as packing that was reopened; a PDF that couldn't render has nothing to add.
      toast.add({
        title: t("packingListFailed"),
        description: error instanceof Error ? undefined : errorText(error),
        type: "error"
      })
    } finally {
      setBusy(false)
    }
  }
  return { download, busy }
}
