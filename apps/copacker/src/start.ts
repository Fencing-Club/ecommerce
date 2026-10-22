import { createCsrfMiddleware, createMiddleware, createServerOnlyFn, createStart } from "@tanstack/react-start"
import { deleteCookie, getCookie } from "@tanstack/react-start/server"
import { appOriginPolicy } from "@/server/http-response"
import { resumeCookie, returnPath, siteUrlFor } from "@/server/security"

const resumeSignOut = createMiddleware().server(async ({ request, next }) => {
  const resume = getCookie(resumeCookie)
  if (resume && new URL(request.url).pathname === "/") {
    deleteCookie(resumeCookie, { path: "/" })
    return Response.redirect(new URL(returnPath(resume, "/"), siteUrlFor(request.headers)), 303)
  }
  return next()
})
// Only the server checks origins. The policy reads server settings and messages, so the browser's build of this file
// leaves it out.
const appOrigin = createCsrfMiddleware({
  filter: createServerOnlyFn(appOriginPolicy.filter),
  origin: createServerOnlyFn(appOriginPolicy.origin),
  failureResponse: createServerOnlyFn(appOriginPolicy.failureResponse)
})
export const startInstance = createStart(() => ({
  requestMiddleware: [resumeSignOut, appOrigin]
}))
