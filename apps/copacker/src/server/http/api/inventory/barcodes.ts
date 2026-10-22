import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import { requirePage, session } from "@/server/auth"
import { errorResponse, StatusError } from "@/server/errors"
import { fallbackResponse, fileResponse } from "@/server/http-response"
import { sendQueuedLabels } from "@/server/label-release"
import { productLabelFile, removeProductBarcode, saveProductBarcode } from "@/server/product-barcodes"

function variantFrom(request: Request) {
  return variantIdSchema.safeParse(new URL(request.url).searchParams.get("variantId"))
}

// Uploads a variation's barcode label: form fields variantId and file, a one-page PDF.
export async function POST(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  if (Number(request.headers.get("content-length") ?? 0) > 34 * 1024 * 1024) {
    return errorResponse("choosePdfUnder32", 400)
  }
  try {
    const form = await request.formData().catch(() => {
      throw new StatusError("choosePdfToUpload", 400)
    })
    const { labels, ...saved } = await saveProductBarcode(s, form)
    await sendQueuedLabels(labels)
    return Response.json(saved)
  } catch (error) {
    return fallbackResponse(error, "barcodeNotUploaded")
  }
}

export async function GET(request: Request) {
  const s = await session()
  requirePage(s, "products")
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return errorResponse("chooseVariation", 400)
  }
  try {
    const file = await productLabelFile(s, variantId.data)
    // "view=inline" shows the label in the browser, such as in the product's preview.
    const disposition = new URL(request.url).searchParams.get("view") === "inline" ? "inline" : "attachment"
    return fileResponse(Buffer.from(file.bytes), { filename: file.name, contentType: "application/pdf", disposition })
  } catch (error) {
    return fallbackResponse(error, "barcodeNotDownloaded")
  }
}

export async function DELETE(request: Request) {
  const s = await session()
  requirePage(s, "products", "edit")
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return errorResponse("chooseVariation", 400)
  }
  try {
    await removeProductBarcode(s, variantId.data)
    return Response.json({ ok: true })
  } catch (error) {
    return fallbackResponse(error, "barcodeNotRemoved")
  }
}
