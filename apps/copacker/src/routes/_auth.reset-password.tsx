import { createFileRoute } from "@tanstack/react-router"
import { authRoute } from "./-page-route"

export const Route = createFileRoute("/_auth/reset-password")(authRoute("reset-password"))
