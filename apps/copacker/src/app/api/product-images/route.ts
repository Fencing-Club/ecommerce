import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { suppliers } from "@/db/schema"
import type { ProductImage } from "@/lib/supplier-product"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"
import { getFile, putFile } from "@/server/storage"

const maxBytes = 10 * 1024 * 1024
const kinds = [
  { type: "image/jpeg", extension: "jpg", test: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", extension: "png", test: (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e },
  { type: "image/gif", extension: "gif", test: (b: Uint8Array) => String.fromCharCode(...b.slice(0, 4)) === "GIF8" },
  {
    type: "image/webp",
    extension: "webp",
    test: (b: Uint8Array) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  }
] as const
const keyPattern = /^supplier-images\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/

// Stores a product photo a supplier uploads. The product keeps it once the product is saved.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
    }
    const file = (await request.formData()).get("file")
    if (!(file instanceof File)) {
      throw new Error("Choose a photo")
    }
    if (file.size > maxBytes) {
      throw new Error("Photos can be up to 10 MB")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = kinds.find((candidate) => candidate.test(bytes))
    if (!kind) {
      throw new Error("Upload a JPG, PNG, WebP or GIF photo")
    }
    const image: ProductImage = {
      key: `supplier-images/${s.org.id}/${randomUUID()}.${kind.extension}`,
      name: file.name.slice(0, 255),
      contentType: kind.type
    }
    await putFile(image.key, bytes, kind.type)
    return Response.json(image)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 })
  }
}

// A product photo, for the supplier that owns it and the buyers it supplies.
export async function GET(request: Request) {
  const s = await session()
  const key = new URL(request.url).searchParams.get("key") ?? ""
  const match = keyPattern.exec(key)
  if (!match) {
    return new Response("Photo not found", { status: 404 })
  }
  const owner = match[1]!
  if (owner !== s.org.id) {
    const [link] =
      s.org.kind === "buyer"
        ? await db()
            .select({ id: suppliers.id })
            .from(suppliers)
            .where(
              and(eq(suppliers.buyerOrgId, s.org.id), eq(suppliers.supplierOrgId, owner), isNull(suppliers.removedAt))
            )
        : []
    if (!link) {
      return new Response("Photo not found", { status: 404 })
    }
  }
  const kind = kinds.find((candidate) => candidate.extension === match[2])!
  const bytes = await getFile(key)
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": kind.type,
      // Keys never change content, so a browser can keep a photo.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  })
}
