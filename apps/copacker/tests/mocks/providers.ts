import type * as Documents from "@repo/copacker-shipments/documents"
import type * as ProductLabels from "@repo/copacker-shipments/product-labels"
import { PDFDocument } from "pdf-lib"
import { vi } from "vitest"
import type * as ImportTrace from "../../src/server/import-trace"
import type * as ProductFields from "../../src/server/product-fields"
import type * as Readiness from "../../src/server/readiness"
import type * as Storage from "../../src/server/storage"

// Mocked modules for the workflow tests in tests/workflow. Each test file passes these to its own `vi.mock` calls, so
// the factories and the mocks the tests answer with are one module:
// `vi.mock("../../src/server/storage", async (original) => (await import("../mocks/providers")).storageModule(original))`.

type ImportOriginal = <T>() => Promise<T>

// Copacker's connections: `amazonFor` and `shopifyFor` give the clients a test sets up, usually `provider.api`, whose
// calls each test answers.
export const provider = {
  amazonFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  shopifyFor: vi.fn<(...args: never[]) => Promise<unknown>>(),
  connection: vi.fn<(...args: never[]) => Promise<unknown>>(),
  api: {
    graphql: vi.fn<(...args: never[]) => Promise<unknown>>(),
    request: vi.fn<(...args: never[]) => Promise<unknown>>(),
    report: vi.fn<(...args: never[]) => Promise<unknown>>(),
    eligibility: vi.fn<(...args: never[]) => Promise<unknown>>(),
    create: vi.fn<(...args: never[]) => Promise<unknown>>(),
    order: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdInboundShipment: vi.fn<(...args: never[]) => Promise<unknown>>(),
    confirm: vi.fn<(...args: never[]) => Promise<unknown>>(),
    labels: vi.fn<(...args: never[]) => Promise<unknown>>(),
    listings: vi.fn<(...args: never[]) => Promise<unknown>>(),
    stock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    metafieldValues: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaStock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdStock: vi.fn<(...args: never[]) => Promise<unknown>>(),
    salesMarketplaces: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipmentUnits: vi.fn<(...args: never[]) => Promise<unknown>>(),
    awdShipmentUnits: vi.fn<(...args: never[]) => Promise<unknown>>(),
    cancel: vi.fn<(...args: never[]) => Promise<unknown>>(),
    prepDetails: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaCreatePlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaOperation: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGeneratePackingOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPackingOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPackingGroupItems: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmPackingOption: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaSetPacking: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlanBoxes: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGeneratePlacementOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaPlacementOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmPlacementOption: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipment: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaShipmentBoxes: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGenerateTransportationOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaTransportationOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaGenerateDeliveryWindowOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaDeliveryWindowOptions: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmDeliveryWindow: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaConfirmTransportation: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaCancelPlan: vi.fn<(...args: never[]) => Promise<unknown>>(),
    fbaBoxLabel: vi.fn<(...args: never[]) => Promise<unknown>>()
  }
}
export function connectionsModule() {
  return { amazonFor: provider.amazonFor, shopifyFor: provider.shopifyFor, connection: provider.connection }
}

// The tests give Shopify's variants their supplier SKUs and ASINs directly; product-fields.test.ts covers Copacker
// keeping them.
export async function productFieldsModule(importOriginal: ImportOriginal) {
  return {
    ...(await importOriginal<typeof ProductFields>()),
    withVariantFields: async (_orgId: string, _domain: string, variants: unknown[]) => variants
  }
}

// Private storage, which tests read and write through `storage`.
export const storage = {
  putFile: vi.fn<(...args: never[]) => Promise<void>>(),
  getFile: vi.fn<(key: string) => Promise<Uint8Array>>(),
  deleteFile: vi.fn<(key: string) => Promise<void>>()
}
export async function storageModule(importOriginal: ImportOriginal) {
  return {
    ...(await importOriginal<typeof Storage>()),
    putFile: storage.putFile,
    getFile: storage.getFile,
    deleteFile: storage.deleteFile,
    readFile: async (key: string) => ({ body: new Response(Buffer.from(await storage.getFile(key))).body! })
  }
}

// Tests never draw documents: the purchase order and invoice are stand-in bytes, and tests read what the purchase order
// was given, such as its ship-to.
export async function documentsModule(importOriginal: ImportOriginal) {
  const documents = await importOriginal<typeof Documents>()
  const pdf = async () => new TextEncoder().encode("%PDF-1.7 test document")
  return {
    ...documents,
    purchaseOrderPdf: vi.fn<typeof documents.purchaseOrderPdf>(pdf),
    commercialInvoicePdf: vi.fn<typeof documents.commercialInvoicePdf>(pdf)
  }
}

// Nor do they draw label sheets: a product's labels and the suffocation warning labels are a blank page, which a packet
// can combine with other files, and tests read what the sheet was given.
export async function productLabelsModule(importOriginal: ImportOriginal) {
  const labels = await importOriginal<typeof ProductLabels>()
  const sheet = async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    return pdf.save()
  }
  return {
    ...labels,
    standardProductLabels: vi.fn<typeof labels.standardProductLabels>(sheet),
    suffocationWarningLabels: vi.fn<typeof labels.suffocationWarningLabels>(sheet)
  }
}

export async function importTraceModule(importOriginal: ImportOriginal) {
  return { ...(await importOriginal<typeof ImportTrace>()), traceImport: async () => true }
}

// Checking a shipment's labels can be made to fail, to show sending them is tried again.
export async function readinessModule(importOriginal: ImportOriginal) {
  const actual = await importOriginal<typeof Readiness>()
  return { ...actual, releaseIssues: vi.fn<typeof actual.releaseIssues>(actual.releaseIssues) }
}
