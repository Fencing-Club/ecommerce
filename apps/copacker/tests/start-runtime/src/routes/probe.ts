import { createFileRoute } from "@tanstack/react-router"
import { databaseProbe, documentProbe, sessionProbe } from "../probes.server"

export const Route = createFileRoute("/probe")({
  server: {
    handlers: {
      GET: ({ request }) => sessionProbe(request),
      DELETE: ({ request }) => sessionProbe(request),
      POST: ({ request }) => {
        switch (new URL(request.url).searchParams.get("kind")) {
          case "database":
            return databaseProbe()
          case "document":
            return documentProbe()
          default:
            return sessionProbe(request)
        }
      }
    }
  }
})
