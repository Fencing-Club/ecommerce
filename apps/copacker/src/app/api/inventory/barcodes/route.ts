import { session } from "@/server/auth"
import {
  ProductBarcodeError,
  productBarcodeFile,
  removeProductBarcode,
  saveProductBarcode,
  variantIdSchema
} from "@/server/product-barcodes"
import { appUrl } from "@/server/security"

const headers = { "Cache-Control": "private, no-store" }

function failure(error: unknown, fallback: string) {
  if (error instanceof ProductBarcodeError) {
    return Response.json({ error: error.message }, { status: error.status, headers })
  }
  return Response.json({ error: fallback }, { status: 500, headers })
}

function variantFrom(request: Request) {
  return variantIdSchema.safeParse(new URL(request.url).searchParams.get("variantId"))
}

// Uploads a variation's barcode label: form fields variantId and file, a one-page PDF.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  if (Number(request.headers.get("content-length") ?? 0) > 34 * 1024 * 1024) {
    return Response.json({ error: "Choose a PDF smaller than 32 MB" }, { status: 400, headers })
  }
  try {
    const form = await request.formData().catch(() => {
      throw new ProductBarcodeError("Choose a PDF to upload", 400)
    })
    return Response.json(await saveProductBarcode(s, form), { headers })
  } catch (error) {
    return failure(error, "The barcode couldn't be uploaded. Try again.")
  }
}

export async function GET(request: Request) {
  const s = await session()
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return Response.json({ error: "Choose a product variation" }, { status: 400, headers })
  }
  try {
    const file = await productBarcodeFile(s, variantId.data)
    return new Response(Buffer.from(file.bytes), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox"
      }
    })
  } catch (error) {
    return failure(error, "The barcode couldn't be downloaded. Try again.")
  }
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers })
  }
  const s = await session()
  const variantId = variantFrom(request)
  if (!variantId.success) {
    return Response.json({ error: "Choose a product variation" }, { status: 400, headers })
  }
  try {
    await removeProductBarcode(s, variantId.data)
    return Response.json({ ok: true }, { headers })
  } catch (error) {
    return failure(error, "The barcode couldn't be removed. Try again.")
  }
}
