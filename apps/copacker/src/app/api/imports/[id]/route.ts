import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { jobs, poImports } from "@/db/schema"
import { session, requireBuyer, requirePage } from "@/server/auth"
import { shopifyFor } from "@/server/connections"
import { importProposalSchema } from "@/server/import-proposal"
import { appUrl } from "@/server/security"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Import not found" }, { status: 404 })
  }
  const [row] = await db()
    .select({
      id: poImports.id,
      filename: poImports.filename,
      status: poImports.status,
      revision: poImports.revision,
      proposal: poImports.proposal,
      error: poImports.error,
      promptVersion: poImports.promptVersion,
      model: poImports.model,
      orderId: poImports.orderId
    })
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  return row ? Response.json(row) : Response.json({ error: "Import not found" }, { status: 404 })
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Import not found" }, { status: 404 })
  }
  const result = await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(poImports)
      .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
      .for("update")
    if (!row || row.status === "saved") {
      return false
    }
    await tx
      .update(poImports)
      .set({ status: "cancelled", revision: row.revision + 1, updatedAt: new Date() })
      .where(eq(poImports.id, id))
    return true
  })
  return Response.json(result ? { status: "cancelled" } : { error: "Import cannot be cancelled" }, {
    status: result ? 200 : 409
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Import not found" }, { status: 404 })
  }
  const input = z
    .object({ revision: z.number().int().positive(), proposal: importProposalSchema })
    .strict()
    .safeParse(await request.json().catch(() => null))
  if (!input.success) {
    return Response.json({ error: "Review fields are invalid" }, { status: 400 })
  }
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record || record.status !== "review") {
    return Response.json({ error: "Import is not ready for review" }, { status: 409 })
  }
  if (record.revision !== input.data.revision) {
    return Response.json({ error: "Import changed. Refresh before saving corrections" }, { status: 409 })
  }
  const ids = [
    ...new Set(
      input.data.proposal.items.flatMap((item) => [
        ...item.candidateVariantIds,
        ...(item.selectedVariantId ? [item.selectedVariantId] : [])
      ])
    )
  ]
  const verified = new Set<string>()
  try {
    if (ids.length) {
      const shop = await shopifyFor(s.org.id, record.shopifyDomain)
      for (let start = 0; start < ids.length; start += 100) {
        for (const variant of await shop.variants(ids.slice(start, start + 100))) {
          if (variant) {
            verified.add(variant.id)
          }
        }
      }
    }
  } catch {
    return Response.json(
      { error: "Catalog verification is unavailable. Your corrections have not been saved. Try again." },
      { status: 503 }
    )
  }
  if (ids.some((id) => !verified.has(id))) {
    return Response.json({ error: "Choose products from the connected Shopify store" }, { status: 400 })
  }
  const updated = await db()
    .update(poImports)
    .set({ proposal: input.data.proposal, revision: input.data.revision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(poImports.id, id),
        eq(poImports.orgId, s.org.id),
        eq(poImports.status, "review"),
        eq(poImports.revision, input.data.revision)
      )
    )
    .returning({ revision: poImports.revision })
  return updated[0]
    ? Response.json(updated[0])
    : Response.json({ error: "Import changed. Refresh before saving corrections" }, { status: 409 })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "Import not found" }, { status: 404 })
  }
  const retried = await db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(poImports)
      .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
      .for("update")
    if (!row || row.status !== "failed") {
      return null
    }
    const revision = row.revision + 1
    await tx
      .update(poImports)
      .set({ status: "queued", error: null, revision, updatedAt: new Date() })
      .where(eq(poImports.id, id))
    await tx.insert(jobs).values({ key: `import:${id}:${revision}`, kind: "import", payload: { id, revision } })
    return { id, revision, status: "queued" }
  })
  return retried
    ? Response.json(retried, { status: 202 })
    : Response.json({ error: "Only failed imports can be retried" }, { status: 409 })
}
