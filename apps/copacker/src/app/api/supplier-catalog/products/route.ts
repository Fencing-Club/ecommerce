import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { supplierProducts } from "@/db/schema"
import { session } from "@/server/auth"
import { appUrl } from "@/server/security"

const productInput = z.strictObject({
  id: z.uuid().optional(),
  revision: z.number().int().positive().optional(),
  supplierSku: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(500),
  currency: z.enum(["USD", "CNY", "EUR", "GBP", "CAD", "AUD"]),
  priceMinor: z.number().int().nonnegative().max(2147483647).nullable(),
  priceBasis: z.enum(["piece", "sellable_pack", "case"]),
  piecesPerSellablePack: z.number().int().positive().max(2147483647),
  sellablePacksPerCase: z.number().int().positive().max(2147483647).nullable(),
  notes: z.string().max(2000).nullable(),
  active: z.boolean()
})

export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try {
    const s = await session()
    if (s.org.kind !== "supplier") {
      return Response.json({ error: "A supplier workspace is required" }, { status: 403 })
    }
    const input = productInput.parse(await request.json())
    if (
      input.sellablePacksPerCase !== null &&
      !Number.isSafeInteger(input.piecesPerSellablePack * input.sellablePacksPerCase)
    ) {
      throw new Error("Pack quantity exceeds the supported range")
    }
    const { id, revision, active, ...fields } = input
    if (!id) {
      const [created] = await db()
        .insert(supplierProducts)
        .values({ supplierOrgId: s.org.id, ...fields, active: active ? 1 : 0 })
        .returning({ id: supplierProducts.id })
      return Response.json({ id: created!.id, revision: 1 })
    }
    if (!revision) {
      throw new Error("Product revision is required")
    }
    const [updated] = await db()
      .update(supplierProducts)
      .set({ ...fields, active: active ? 1 : 0, revision: revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(supplierProducts.id, id),
          eq(supplierProducts.supplierOrgId, s.org.id),
          eq(supplierProducts.revision, revision)
        )
      )
      .returning({ id: supplierProducts.id })
    if (!updated) {
      return Response.json({ error: "This product changed. Refresh and try again" }, { status: 409 })
    }
    return Response.json({ id, revision: revision + 1 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save product" }, { status: 400 })
  }
}
