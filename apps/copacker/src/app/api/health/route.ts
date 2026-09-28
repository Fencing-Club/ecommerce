// Read at request time: the deploy sets APP_COMMIT_SHA on the service, and checks it here to know its release is live.
export const dynamic = "force-dynamic"

export function GET() {
  return Response.json({ status: "ok", service: "copacker", commit: process.env.APP_COMMIT_SHA ?? null })
}
