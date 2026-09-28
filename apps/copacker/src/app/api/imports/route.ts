import { randomUUID } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { db } from "@/db"
import { connections, jobs, poImports } from "@/db/schema"
import { session, requireBuyer } from "@/server/auth"
import { appUrl } from "@/server/security"
import { putFile, validatePdf } from "@/server/storage"

export async function GET() {
  const s = await session()
  requireBuyer(s)
  const items = await db()
    .select({
      id: poImports.id,
      filename: poImports.filename,
      status: poImports.status,
      revision: poImports.revision,
      createdAt: poImports.createdAt
    })
    .from(poImports)
    .where(eq(poImports.orgId, s.org.id))
    .orderBy(desc(poImports.createdAt))
    .limit(50)
  return Response.json({ items })
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appUrl()) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 })
  }
  const s = await session()
  requireBuyer(s)
  if (Number(request.headers.get("content-length") ?? 0) > 11 * 1024 * 1024) {
    return Response.json({ error: "Import PDF must be at most 10 MB" }, { status: 413 })
  }
  try {
    const data = await request.formData(),
      file = data.get("file")
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) {
      throw new Error("Choose a PDF of at most 10 MB")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await validatePdf(bytes)
    if ((await PDFDocument.load(bytes)).getPageCount() > 50) {
      throw new Error("Import PDFs may contain at most 50 pages")
    }
    const linked = await db().select().from(connections).where(eq(connections.orgId, s.org.id))
    const shop = linked.find((c) => c.provider === "shopify"),
      amazon = linked.find((c) => c.provider === "amazon")
    if (!shop) {
      throw new Error("Connect Shopify before importing a purchase order")
    }
    if (
      !process.env.OPENROUTER_API_KEY ||
      !process.env.LANGFUSE_SECRET_KEY ||
      !process.env.LANGFUSE_PUBLIC_KEY ||
      !process.env.LANGFUSE_BASE_URL
    ) {
      throw new Error("AI import is not configured")
    }
    const id = randomUUID(),
      objectKey = `${s.org.id}/imports/${id}/source.pdf`
    // Publish the import and job together only after its source exists.
    await putFile(objectKey, bytes)
    await db().transaction(async (tx) => {
      await tx.insert(poImports).values({
        id,
        orgId: s.org.id,
        createdBy: s.user.id,
        objectKey,
        filename: file.name.slice(0, 255),
        shopifyDomain: shop.externalId,
        amazonSellerId: amazon?.externalId,
        status: "queued"
      })
      await tx.insert(jobs).values({ key: `import:${id}:1`, kind: "import", payload: { id, revision: 1 } })
    })
    return Response.json({ id, status: "queued" }, { status: 202 })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Import could not be started" },
      { status: 400 }
    )
  }
}
