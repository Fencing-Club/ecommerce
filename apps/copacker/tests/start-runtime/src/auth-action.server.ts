import { env } from "cloudflare:workers"
import { z } from "zod"
import { withDatabase } from "@/db"
import { signInRequest } from "@/server/auth-session"
import { failureMessage, failureStatus } from "@/server/errors"
import { signInActions } from "@/server/sign-in-actions"
import { portalHttp } from "./portal-http.server"

const input = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })

// This protected fixture exposes authentication actions and the isolated workspace-switch scenario.
// The same registry and schema validation run in the current application's /api/action.
export async function authAction(request: Request) {
  if (!process.env.WORKOS_API_KEY?.startsWith("sk_test_")) {
    return new Response(null, { status: 503 })
  }
  try {
    const { action, data } = input.parse(await request.json())
    if (action === "workspace.switch") {
      return portalHttp(request, "switch", data)
    }
    const run = signInActions.get(action)
    if (!run) {
      return new Response(null, { status: 404 })
    }
    const result = await withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, () =>
      run(signInRequest(), data)
    )
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: await failureMessage(error) }, { status: failureStatus(error) })
  }
}
