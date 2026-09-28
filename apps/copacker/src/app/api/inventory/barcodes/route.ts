import { type ErrorKey } from "@/i18n/errors"
import { requirePage, session } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import {
  ProductBarcodeError,
  productLabelFile,
  removeProductBarcode,
  saveProductBarcode,
  variantIdSchema
} from "@/server/product-barcodes"
import { isAppOrigin } from "@/server/security"

const headers = { "Cache-Control": "private, no-store" }

async function failure(error: unknown, fallback: ErrorKey) {
  if (error instanceof ProductBarcodeError) {
    return Response.json({ error: await failureMessage(error) }, { status: error.status, headers })
  }
  return errorResponse(fallback, 500, headers)
}

function variantFrom(request: Request) {
  return variantIdSchema.safeParse(new URL(request.url).searchParams.get("variantId"))
}

// Uploads a variation's barcode label: form fields variantId and file, a one-page PDF.
export async function POST(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  if (Number(request.headers.get("content-length") ?? 0) > 34 * 1024 * 1024) {
    return errorResponse("choosePdfUnder32", 400, headers)
  }
  try {
    const form = await request.formData().catch(() => {
      throw new ProductBarcodeError("choosePdfToUpload", 400)
    })
    return Response.json(await saveProductBarcode(s, form), { headers })
  } catch (error) {
    return failure(error, "barcodeNotUploaded")
  }
}

export async function GET(request: Request) {
  const s = await session()
  requirePage(s, "products")
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return errorResponse("chooseVariation", 400, headers)
  }
  try {
    const file = await productLabelFile(s, variantId.data)
    // "view=inline" shows the label in the browser, such as in the product's preview.
    const disposition = new URL(request.url).searchParams.get("view") === "inline" ? "inline" : "attachment"
    return new Response(Buffer.from(file.bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    })
  } catch (error) {
    return failure(error, "barcodeNotDownloaded")
  }
}

export async function DELETE(request: Request) {
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403, headers)
  }
  const s = await session()
  requirePage(s, "products", "edit")
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return errorResponse("chooseVariation", 400, headers)
  }
  try {
    await removeProductBarcode(s, variantId.data)
    return Response.json({ ok: true }, { headers })
  } catch (error) {
    return failure(error, "barcodeNotRemoved")
  }
}
