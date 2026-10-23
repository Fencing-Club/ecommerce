import { removeLocationGroupSchema, saveLocationGroupSchema } from "@repo/copacker-contract"
import { session } from "@/server/auth"
import { CliError } from "@/server/cli-auth"
import { requestInput, requestJson } from "@/server/errors"
import { listLocationGroups, removeLocationGroup, saveLocationGroup } from "@/server/stock-targets"

async function respond(run: () => Promise<unknown>) {
  try {
    return Response.json(await run())
  } catch (error) {
    if (error instanceof CliError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
export async function GET() {
  const s = await session("api")
  return respond(() => listLocationGroups(s))
}
export async function POST(request: Request) {
  const s = await session("api")
  const input = requestInput(saveLocationGroupSchema, await requestJson(request))
  return respond(() => saveLocationGroup(s, input))
}
export async function DELETE(request: Request) {
  const s = await session("api")
  const input = requestInput(removeLocationGroupSchema, await requestJson(request))
  return respond(() => removeLocationGroup(s, input))
}
