import type { NextRequest } from "next/server"

// The marketing pages, which a signed-out visitor sees the same as anyone else speaking their language.
const marketingPages = new Set(["/", "/contact", "/privacy", "/terms", "/unsubscribe"])

// Next.js sends every page rendered per request with no-store, which keeps the browser from restoring it from its
// back/forward cache when someone goes back to it. A signed-out visitor's marketing pages, and the links between them
// the browser fetches ahead, hold nothing of theirs beyond their address, so they go out with no-cache instead: the
// browser still asks the server each time it loads one, but going back shows it again at once. Signed in, home sends
// people on to their workspace, so their pages stay as Next.js sends them.
export function keepForBackForwardCache(request: NextRequest, response: Response) {
  const page =
    (request.method === "GET" || request.method === "HEAD") &&
    marketingPages.has(request.nextUrl.pathname) &&
    !request.cookies.has(process.env.WORKOS_COOKIE_NAME || "wos-session")
  // Only a response that goes on to the page; one that sets a cookie, such as AuthKit's, keeps its own caching.
  const headers = response.headers
  if (page && headers.get("x-middleware-next") === "1" && !headers.has("cache-control") && !headers.has("set-cookie")) {
    headers.set("Cache-Control", "private, no-cache")
  }
  return response
}
