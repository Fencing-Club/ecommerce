import { maintenanceDocument, maintenanceHeaders, maintenanceUnavailable, withMaintenance } from "./maintenance"

// Render the canonical maintenance route before entering authentication or database context. The browser keeps its
// original URL; its initial router reads the document's maintenance marker when hydrating that route.
export async function maintenanceResponse(
  request: Request,
  render: (request: Request) => Response | Promise<Response>
) {
  if (!maintenanceDocument(request)) {
    return maintenanceUnavailable(request)
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 503,
      headers: { ...maintenanceHeaders, "Content-Type": "text/html; charset=utf-8" }
    })
  }
  // Router input rewriting chooses /maintenance for this invocation. Preserve the actual request for matching
  // during hydration; rewriting the Request itself would give the server and browser different history entries.
  const rendered = await withMaintenance(true, () => render(request))
  const headers = new Headers(rendered.headers)
  for (const [key, value] of Object.entries(maintenanceHeaders)) {
    headers.set(key, value)
  }
  return new Response(rendered.body, { status: 503, headers })
}
