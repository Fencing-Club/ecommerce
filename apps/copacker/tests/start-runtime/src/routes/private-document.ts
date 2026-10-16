import { createFileRoute } from "@tanstack/react-router"
import { privateDocumentProbe } from "../private-document.server"

export const Route = createFileRoute("/private-document")({
  server: { handlers: { POST: ({ request }) => privateDocumentProbe(request) } }
})
