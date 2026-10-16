import { createFileRoute } from "@tanstack/react-router"
import { localizationProbe } from "../localization.server"

export const Route = createFileRoute("/localization")({
  server: { handlers: { GET: () => localizationProbe() } }
})
