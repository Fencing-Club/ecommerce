import { invalidatesHeader } from "@/lib/api-tags"
import { actionCall, type ActionName, type ActionOutput, actions } from "@/server/actions"
import { requestInput, requestJson } from "@/server/errors"

// Runs one action by name (see server/actions). Its failures go on to httpResponse: a refusal is 400, a refused check
// 403, a record that isn't there 404, and anything unexpected 500.
export async function POST(request: Request) {
  const { action, data } = requestInput(actionCall, await requestJson(request))
  const definition = actions[action]
  const result: ActionOutput<ActionName> = await definition.execute(data)
  return Response.json(
    result,
    definition.invalidates.length ? { headers: { [invalidatesHeader]: definition.invalidates.join(", ") } } : undefined
  )
}
