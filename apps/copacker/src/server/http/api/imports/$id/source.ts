import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { poImports } from "@/db/schema"
import { session, requirePage } from "@/server/auth"
import { requireBuyer } from "@/server/authorization"
import { errorTextResponse } from "@/server/errors"
import { getFile } from "@/server/storage"
import { requireMembership } from "@/server/workspace-session"

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const s = await session()
  requireBuyer(s)
  requirePage(s, "orders", "edit")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) {
    return errorTextResponse("notFound", 404)
  }
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.orgId, s.org.id)))
  if (!record) {
    return errorTextResponse("notFound", 404)
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
