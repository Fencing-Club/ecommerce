import { z } from "zod"
import { readLabelPdfPages } from "./label-pdf-reader"
export const awdLabelIdentitySchema = z.strictObject({
  page: z.number().int().positive(),
  fnsku: z.string().regex(/^[A-Z0-9]{10}$/),
  sku: z.string().min(1).max(255),
  quantity: z.number().int().positive(),
  destinationCode: z.string().regex(/^[A-Z0-9]{3,10}$/),
  sscc: z.string().regex(/^\d{18}$/)
})
export function parseAwdLabelPage(raw: string[], page: number) {
  const fields = raw.map((s) => s.trim()).filter(Boolean)
  if (
    fields.length !== 8 ||
    fields[0] !== "FNSKU#:" ||
    fields[1] !== "MSKU#:" ||
    fields[6] !== "Serial Shipping Container Code (SSCC)"
  ) {
    throw new Error("Unsupported AWD label layout; explicit field identity is required.")
  }
  const quantity = /^QTY: (\d+)$/.exec(fields[2]!),
    destination = /^DC: ([A-Z0-9]+)$/.exec(fields[5]!)
  const value = awdLabelIdentitySchema.parse({
    page,
    fnsku: fields[3],
    sku: fields[4],
    quantity: quantity ? Number(quantity[1]) : null,
    destinationCode: destination?.[1],
    sscc: fields[7]
  })
  const checksum = [...value.sscc].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  if (checksum % 10 !== 0) {
    throw new Error("AWD SSCC check digit is invalid.")
  }
  return value
}
/** Single-SKU case label profile observed from the authenticated AWD labels API. */
export async function readAwdLabelPdf(data: Uint8Array, options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  const pdf = await readLabelPdfPages(data, options),
    labels = pdf.pages.map((p) => parseAwdLabelPage(p.items, p.page))
  if (new Set(labels.map((l) => l.sscc)).size !== labels.length) {
    throw new Error("AWD label SSCC is repeated.")
  }
  if (new Set(labels.map((l) => l.destinationCode)).size !== 1) {
    throw new Error("AWD labels mix destination codes.")
  }
  return {
    sha256: pdf.sha256,
    labels,
    profile: "awd-single-sku-sscc" as const,
    supplierCartonMappingVerified: false as const
  }
}
