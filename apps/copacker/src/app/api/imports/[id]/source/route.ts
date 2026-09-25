import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { session, requireBuyer, requireMembership } from "@/server/auth"
import { getFile } from "@/server/storage"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await session()
  requireBuyer(s)
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return new Response("Not found", { status: 404 })
  }
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record) {
    return new Response("Not found", { status: 404 })
  }
  const bytes = await getFile(record.objectKey)
  await requireMembership(s.user.id, s.org.id)
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "inline; filename=import-source.pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox"
    }
  })
}
