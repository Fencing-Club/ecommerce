import { randomUUID } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import { PDFDocument } from "pdf-lib"
import { db } from "@/db"
import { connections, jobs, poImports } from "@/db/schema"
import { LocalizedError } from "@/i18n/errors"
import { session, requireBuyer, requirePage } from "@/server/auth"
import { errorResponse, failureMessage } from "@/server/errors"
import { withJobWake } from "@/server/job-delivery"
import { isAppOrigin } from "@/server/security"
import { putFile, validatePdf } from "@/server/storage"

export async function GET() {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
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
  if (!isAppOrigin(request.headers.get("origin"))) {
    return errorResponse("invalidOrigin", 403)
  }
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  if (Number(request.headers.get("content-length") ?? 0) > 11 * 1024 * 1024) {
    return errorResponse("importPdfTooLarge", 413)
  }
  try {
    const data = await request.formData(),
      file = data.get("file")
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024) {
      throw new LocalizedError("choosePdfUpTo10")
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await validatePdf(bytes)
    if ((await PDFDocument.load(bytes)).getPageCount() > 50) {
      throw new LocalizedError("importPdfTooManyPages")
    }
    const linked = await db().select().from(connections).where(eq(connections.orgId, s.org.id))
    const shop = linked.find((c) => c.provider === "shopify"),
      amazon = linked.find((c) => c.provider === "amazon")
    if (!shop) {
      throw new LocalizedError("connectShopifyBeforeImport")
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
    await withJobWake(
      db().transaction(async (tx) => {
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
    )
    return Response.json({ id, status: "queued" }, { status: 202 })
  } catch (error) {
    return Response.json({ error: await failureMessage(error, "importNotStarted") }, { status: 400 })
  }
}
