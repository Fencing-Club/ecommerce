import { z } from "zod"
import { signedInUser } from "@/server/auth"
import { approveCliConsent, CliError } from "@/server/cli-auth"
import { cliForm } from "@/server/cli-http"
import { isAppOrigin } from "@/server/security"
export async function POST(request: Request) {
  try {
    if (!isAppOrigin(request.headers.get("origin")) || request.headers.has("authorization")) {
      throw new CliError("invalid_request", "Return to the CLI and sign in again.", 403)
    }
    const user = await signedInUser()
    if (!user) {
      throw new CliError("unauthenticated", "Sign in again.", 401)
    }
    const parsed = z
      .strictObject({
        intent: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        decision: z.enum(["allow", "deny"])
      })
      .safeParse(await cliForm(request))
    if (!parsed.success) {
      throw new CliError("invalid_request", "Invalid approval request.")
    }
    const { intent, state, decision } = parsed.data
    const location = await approveCliConsent(user.id, intent, state, decision === "allow")
    return new Response(null, { status: 303, headers: { Location: location, "Referrer-Policy": "no-referrer" } })
  } catch (error) {
    return Response.json(
      { error: error instanceof CliError ? error.code : "server_error" },
      { status: error instanceof CliError ? error.status : 500 }
    )
  }
}
