import { http, HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"

// A change the app sends to /api/action.
export type ActionRequest = { action: string; data: Record<string, unknown> }

// How the story's server answers a change. Nothing means it succeeds.
type Answer = (request: ActionRequest) => Response | Promise<Response> | undefined

function isActionRequest(body: unknown): body is ActionRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    typeof body.action === "string" &&
    "data" in body &&
    typeof body.data === "object" &&
    body.data !== null
  )
}

// The story's /api/action, for `msw.use` in a beforeEach or play function. It keeps each change in `sent`, oldest
// first, for the play function to check, and answers it with `answer`'s reply, or success. It starts `sent` over, so a
// story never sees the changes the one before it sent.
export function recordActions(sent: ActionRequest[], answer?: Answer) {
  sent.length = 0
  return http.post("/api/action", async ({ request }) => {
    const body: unknown = await request.json()
    if (!isActionRequest(body)) {
      return HttpResponse.json({ error: "Bad request" }, { status: 400 })
    }
    sent.push(body)
    return (await answer?.(body)) ?? HttpResponse.json({ ok: true })
  })
}

// A change that succeeds and moves on to `path`.
export const redirectTo = (path: string) => () => HttpResponse.json({ ok: true, redirect: path })

// A change the server turns down with `message`, already in the person's language.
export const failWith =
  (message: string, status = 400) =>
  () =>
    HttpResponse.json({ error: message }, { status })

// An answer that never comes, for a story that stays on what shows while a request is on its way, or that would
// otherwise leave the page (such as after deleting a workspace).
export async function held(): Promise<Response> {
  await delay("infinite")
  return HttpResponse.json({ ok: true })
}
