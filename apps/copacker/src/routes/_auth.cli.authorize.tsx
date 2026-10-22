import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { readCliConsent } from "@/cli.functions"
import { CliConsent } from "@/components/auth/cli-consent"
import { pageHead } from "./-page-route"

export const Route = createFileRoute("/_auth/cli/authorize")({
  validateSearch: z.object({
    response_type: z.literal("code"),
    client_id: z.literal("copacker-cli"),
    redirect_uri: z.string(),
    state: z.string(),
    code_challenge: z.string(),
    code_challenge_method: z.literal("S256")
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readCliConsent({ data: deps }),
  head: (context) => ({
    ...pageHead(context),
    // Native form POSTs under no-referrer send Origin: null and fail the consent origin check.
    // Keep the origin on this same-site POST; the consent response suppresses referrers to the loopback callback.
    meta: [...(pageHead(context).meta ?? []), { name: "referrer", content: "same-origin" }]
  }),
  component: CliConsentPage
})
function CliConsentPage() {
  return <CliConsent {...Route.useLoaderData()} />
}
