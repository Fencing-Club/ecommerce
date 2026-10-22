import { session } from "@/server/auth"
import { requireAccess } from "@/server/authorization"
import { saveCatalog } from "@/server/catalogs"
import { requestJson } from "@/server/errors"

// Creates or saves a catalog from its form. Catalogs are about money, so only someone who sees prices has them.
export async function POST(request: Request) {
  const s = await session()
  requireAccess(s, "catalogs", "edit")
  return Response.json(await saveCatalog(s, await requestJson(request)))
}
