import { createFileRoute } from "@tanstack/react-router"
import { storageProbe } from "../private-document.server"
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
          case "storage":
            return storageProbe()
          default:
            return sessionProbe(request)
        }
      }
    }
  }
})
