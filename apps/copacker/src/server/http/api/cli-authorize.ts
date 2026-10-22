import { authorizationParams, CliError } from "@/server/cli-auth"
export function GET(request: Request) {
  try {
    const input = authorizationParams(new URL(request.url).searchParams)
    return new Response(null, { status: 303, headers: { Location: `/cli/authorize?${new URLSearchParams(input)}` } })
  } catch (error) {
    return Response.json({ error: error instanceof CliError ? error.code : "invalid_request" }, { status: 400 })
  }
}
