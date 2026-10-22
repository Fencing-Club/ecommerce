import { env } from "cloudflare:workers"
import { objectHasOwn } from "ts-extras"
import { z } from "zod"
import { withDatabase } from "@/db"
import { signInActions } from "@/server/actions/sign-in"
import { requestInput, requestJson } from "@/server/errors"
import { httpResponse } from "@/server/http-response"
import { portalHttp } from "./portal-http.server"

const input = z.object({ action: z.string(), data: z.record(z.string(), z.unknown()) })
const isSignInAction = (name: string): name is keyof typeof signInActions => objectHasOwn(signInActions, name)

// This protected fixture exposes authentication actions and the isolated workspace-switch scenario.
// The same definitions and schema validation run in the current application's /api/action.
export async function authAction(request: Request) {
  if (!process.env.WORKOS_API_KEY?.startsWith("sk_test_")) {
    return new Response(null, { status: 503 })
  }
  return httpResponse(request, async () => {
    const { action, data } = requestInput(input, await requestJson(request))
    if (action === "workspace.switch") {
      return portalHttp(request, "switch", data)
    }
    if (!isSignInAction(action)) {
      return new Response(null, { status: 404 })
    }
    const definition = signInActions[action]
    const result = await withDatabase({ connectionString: env.HYPERDRIVE.connectionString }, async () =>
      definition.execute(data)
    )
    return Response.json(result)
  })
}
