import { getCostImport } from "@/server/analytics-cost-imports"
import { analyticsId, analyticsRoute } from "@/server/analytics-http"
export const GET = (request: Request, context: { params: { id: string } }) =>
  analyticsRoute(request, false, async (s) =>
    Response.json({ record: await getCostImport(s.org.id, analyticsId(context.params.id)) })
  )
