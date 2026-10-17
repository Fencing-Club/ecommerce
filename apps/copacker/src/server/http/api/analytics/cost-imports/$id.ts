import { z } from "zod"
import { getCostImport } from "@/server/analytics-cost-imports"
import { analyticsHeaders, analyticsRoute } from "@/server/analytics-http"
export const GET = (request: Request, context: { params: { id: string } }) =>
  analyticsRoute(request, false, async (s) =>
    Response.json(
      { record: await getCostImport(s.org.id, z.uuid().parse((await context.params).id)) },
      { headers: analyticsHeaders }
    )
  )
