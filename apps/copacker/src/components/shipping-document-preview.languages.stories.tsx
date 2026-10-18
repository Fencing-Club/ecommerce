import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { defaultDocumentSettings } from "@/documents/shipping-model"
import { ready, scenario, shippingDocumentStory } from "@/stories/shipping-documents"
import { shippingSettingsKey } from "./shipping-document-preview"

const meta = preview.meta({
  ...shippingDocumentStory,
  title: "Documents/Supplier packet/Languages"
})

export const GermanLetter = meta.story({
  globals: { locale: "de" },
  args: {
    data: scenario("awd-freight"),
    initialKind: "checklist",
    settingsKey: `${shippingSettingsKey}.german`,
    initialSettings: { ...defaultDocumentSettings, language: "de", paper: "LETTER" }
  },
  play: async (context) => {
    await ready(context, { download: "PDF herunterladen", page: "PDF-Seite 1" })
    await expect(context.canvasElement.ownerDocument.documentElement).toHaveAttribute("lang", "de")
    await expect(context.canvas.getByRole("link", { name: "PDF herunterladen" })).toHaveAttribute(
      "download",
      expect.stringContaining("-de-LETTER-ltr.pdf")
    )
  }
})

export const ChineseA4 = meta.story({
  globals: { locale: "zh-CN" },
  args: {
    settingsKey: `${shippingSettingsKey}.chinese`,
    initialSettings: { ...defaultDocumentSettings, language: "zh-CN" }
  },
  play: async (context) => {
    await ready(context, { download: "下载 PDF", page: "PDF 第 1 页" })
    await expect(context.canvasElement.ownerDocument.documentElement).toHaveAttribute("lang", "zh-CN")
    const page = context.canvas.getByRole("figure", { name: "PDF 第 1 页" })
    await expect(page).toHaveTextContent("装箱单")
    await expect(page).toHaveTextContent("NT-WBT-NAT")
    await expect(page).toHaveTextContent("DEMO-TRACK-01")
    await expect(page).not.toHaveTextContent("\uFFFD")
    await expect(context.canvas.queryByRole("figure", { name: "PDF 第 2 页" })).not.toBeInTheDocument()
  }
})

export const UrduRtl = meta.story({
  globals: { locale: "ur" },
  args: {
    settingsKey: `${shippingSettingsKey}.urdu`
  },
  play: async (context) => {
    await ready(context, { download: "PDF ڈاؤن لوڈ کریں", page: "PDF صفحہ 1" })
    await expect(context.canvas.getByRole("link", { name: "PDF ڈاؤن لوڈ کریں" })).toHaveAttribute(
      "download",
      expect.stringContaining("-ur-A4-rtl.pdf")
    )
    await expect(context.canvas.getByRole("figure", { name: "PDF صفحہ 1" })).toHaveTextContent("NT-WBT-NAT")
  }
})

export const UserLanguageDefaults = meta.story({
  globals: { locale: "de" },
  args: { settingsKey: `${shippingSettingsKey}.user-language` },
  play: async (context) => {
    await ready(context, { download: "PDF herunterladen", page: "PDF-Seite 1" })
    await expect(context.canvas.getByRole("link", { name: "PDF herunterladen" })).toHaveAttribute(
      "download",
      expect.stringContaining("-de-A4-ltr.pdf")
    )
    await expect(context.canvas.getByRole("figure", { name: "PDF-Seite 1" })).toHaveTextContent("Packliste")
  }
})
