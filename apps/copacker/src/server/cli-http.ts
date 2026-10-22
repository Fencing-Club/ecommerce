import { z } from "zod"
import { CliError, exchangeCliCode, refreshCliToken, requireCliRequest, revokeCliToken } from "./cli-auth"

export async function boundedBody(request: Request, maximum: number) {
  const reader = request.body?.getReader()
  if (!reader) {
    return ""
  }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      size += value.byteLength
      if (size > maximum) {
        await reader.cancel()
        throw new CliError("input_too_large", "Request exceeds the byte limit.", 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString("utf8")
}
export async function cliForm(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
    throw new CliError("invalid_request", "Expected a form-encoded request.", 415)
  }
  const params = new URLSearchParams(await boundedBody(request, 8192))
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    throw new CliError("invalid_request", "Duplicate parameters.")
  }
  return Object.fromEntries(params)
}
const tokenInput = z.discriminatedUnion("grant_type", [
  z.strictObject({
    grant_type: z.literal("authorization_code"),
    client_id: z.literal("copacker-cli"),
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    redirect_uri: z.string().max(255)
  }),
  z.strictObject({
    grant_type: z.literal("refresh_token"),
    client_id: z.literal("copacker-cli"),
    refresh_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
  })
])
export async function cliTokenResponse(request: Request, revoke = false) {
  try {
    requireCliRequest(request)
    if (request.headers.has("authorization")) {
      throw new CliError("invalid_request", "Use the token form only.")
    }
    const form = await cliForm(request)
    if (revoke) {
      const input = z
        .strictObject({ client_id: z.literal("copacker-cli"), token: z.string().min(1).max(1024) })
        .safeParse(form)
      if (!input.success) {
        throw new CliError("invalid_request", "Invalid revocation request.")
      }
      await revokeCliToken(input.data.token)
      return Response.json({}, { headers: { "Cache-Control": "no-store" } })
    }
    const parsed = tokenInput.safeParse(form)
    if (!parsed.success) {
      throw new CliError("invalid_request", "Invalid token request.")
    }
    const input = parsed.data
    const result =
      input.grant_type === "refresh_token"
        ? await refreshCliToken(input.refresh_token)
        : await exchangeCliCode(input.code, input.code_verifier, input.redirect_uri)
    return Response.json(result, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } })
  } catch (error) {
    return Response.json(
      { error: error instanceof CliError ? error.code : "server_error" },
      {
        status: error instanceof CliError ? error.status : 500,
        headers: { "Cache-Control": "no-store" }
      }
    )
  }
}
