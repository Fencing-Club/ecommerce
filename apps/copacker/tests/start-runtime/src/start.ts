import { createCsrfMiddleware, createStart } from "@tanstack/react-start"

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ request, handlerType }) =>
        handlerType === "serverFn" || !["GET", "HEAD", "OPTIONS"].includes(request.method)
    })
  ]
}))
