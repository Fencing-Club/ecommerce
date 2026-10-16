import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { deleteCookie, getCookie } from "@tanstack/react-start/server"
import { resumeCookie, returnPath, siteUrlFor } from "@/server/security"

const resumeSignOut = createMiddleware().server(async ({ request, next }) => {
  const resume = getCookie(resumeCookie)
  if (resume && new URL(request.url).pathname === "/") {
    deleteCookie(resumeCookie, { path: "/" })
    return Response.redirect(new URL(returnPath(resume, "/"), siteUrlFor(request.headers)), 303)
  }
  return next()
})
export const startInstance = createStart(() => ({
  requestMiddleware: [resumeSignOut, createCsrfMiddleware({ filter: ({ handlerType }) => handlerType === "serverFn" })]
}))
