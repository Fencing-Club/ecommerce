import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server"
import { parseAsBoolean, parseAsStringLiteral, useQueryState } from "nuqs"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { panel } from "../runtime.css"

const readMarker = createServerFn().handler(() => {
  if (getRequestHeader("x-probe-portal")) {
    throw redirect({ to: "/overview" })
  }
  return getCookie("migration-marker") ?? "empty"
})
const writeMarker = createServerFn({ method: "POST" })
  .validator(z.string().max(32))
  .handler(({ data }) => {
    setCookie("migration-marker", data, { httpOnly: true, sameSite: "lax", path: "/" })
    return data
  })

const partnerKinds = ["supplier", "forwarder"] as const
const partner = parseAsStringLiteral(partnerKinds)
const importing = parseAsBoolean.withDefault(false)

export const Route = createFileRoute("/")({
  // Invalid input must fall back just as the existing nuqs consumers do;
  // nuqs' strict Standard Schema adapter would turn an invalid enum into a route error instead.
  validateSearch: z.object({
    add: z.enum(partnerKinds).optional().catch(undefined),
    import: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional()
      .catch(undefined),
    lang: z.enum(["en", "ur"]).optional().catch(undefined)
  }),
  loader: () => readMarker(),
  component: RuntimePage
})

function RuntimePage() {
  const t = useTranslations("common")
  const initial = Route.useLoaderData()
  const [marker, setMarker] = useState(initial)
  const [adding, setAdding] = useQueryState("add", partner)
  const [isImporting, setImporting] = useQueryState("import", importing)
  return (
    <main className={panel}>
      <h1>{t("appDescription")}</h1>
      <p data-testid="partner">{adding ?? "closed"}</p>
      <p data-testid="import">{isImporting ? "open" : "closed"}</p>
      <button onClick={() => void setAdding("supplier")}>Add supplier</button>
      <button onClick={() => void setAdding("forwarder")}>Add forwarder</button>
      <button onClick={() => void setAdding(null)}>Close partner</button>
      <button onClick={() => void setImporting(!isImporting)}>Toggle import</button>
      <button onClick={async () => setMarker(await writeMarker({ data: "saved" }))}>Save server marker</button>
      <p data-testid="marker">{marker}</p>
    </main>
  )
}
