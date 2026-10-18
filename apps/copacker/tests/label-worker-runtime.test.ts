import { fileURLToPath } from "node:url"
import { Miniflare } from "miniflare"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { build } from "vite"
import { expect, it } from "vitest"

it("reads AWD label identities inside the deployed Workers runtime", async () => {
  const reader = fileURLToPath(new URL("../../../packages/aisle/src/awd-label-pdf.ts", import.meta.url))
  const result = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: "silent",
    ssr: { target: "webworker", noExternal: true },
    plugins: [
      {
        name: "label-probe",
        resolveId: (id) => (id === "label-probe" ? id : null),
        load: (id) =>
          id === "label-probe"
            ? `import { readAwdLabelPdf } from ${JSON.stringify(reader)};
        export default {async fetch(request) {return Response.json(await readAwdLabelPdf(new Uint8Array(await request.arrayBuffer())))}}`
            : null
      }
    ],
    build: { ssr: true, write: false, minify: false, rolldownOptions: { input: "label-probe", external: /^node:/ } }
  })
  if (Array.isArray(result) || !("output" in result)) {
    throw new Error("Expected one Worker bundle")
  }
  const chunk = result.output.find((entry) => entry.type === "chunk")
  if (!chunk || chunk.type !== "chunk") {
    throw new Error("Missing Worker bundle")
  }
  const runtime = new Miniflare({
    telemetry: { enabled: false },
    workers: [
      {
        config: {
          name: "label-probe",
          compatibilityDate: "2026-10-15",
          compatibilityFlags: ["nodejs_compat"],
          manifest: { mainModule: "index.js", modules: { "index.js": { type: "esm", contents: chunk.code } } }
        }
      }
    ]
  })
  try {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([432, 288])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const fields = [
      "FNSKU#:",
      "MSKU#:",
      "QTY: 80",
      "X0039VWEF1",
      "supplier-test-sku",
      "DC: IUSP",
      "Serial Shipping Container Code (SSCC)",
      "201952611540373919"
    ]
    fields.forEach((text, index) => page.drawText(text, { x: 20, y: 260 - index * 25, size: 10, font }))
    const response = await runtime.dispatchFetch("http://local/", {
      method: "POST",
      body: new Uint8Array(await pdf.save())
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      labels: [{ page: 1, sku: "supplier-test-sku", quantity: 80, sscc: "201952611540373919" }]
    })
  } finally {
    await runtime.dispose()
  }
}, 60000)
