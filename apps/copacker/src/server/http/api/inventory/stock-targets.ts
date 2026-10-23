import { saveStockTargetsSchema, stockTargetSelectionSchema } from "@repo/copacker-contract"
import { session } from "@/server/auth"
import { CliError } from "@/server/cli-auth"
import { requestInput, requestJson } from "@/server/errors"
import { readStockTargets, saveStockTargets } from "@/server/stock-targets"

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
export async function GET(request: Request) {
  const s = await session("api")
  const input = requestInput(stockTargetSelectionSchema, Object.fromEntries(new URL(request.url).searchParams))
  return respond(() => readStockTargets(s, input))
}
export async function PATCH(request: Request) {
  const s = await session("api")
  const input = requestInput(saveStockTargetsSchema, await requestJson(request))
  return respond(() => saveStockTargets(s, input))
}
