import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { AccessProvider } from "@/components/access"
import { AddPartner } from "@/components/add-partner"
import { PortalForbidden } from "@/components/portal-forbidden"
import { Providers } from "@/components/providers"
import { ProductActions } from "@/components/supplier/product-transfer"
import { readQueryControls } from "../query-controls.functions"
import { panel } from "../runtime.css"

export const Route = createFileRoute("/query/$surface")({
  params: {
    parse: (params) => {
      const result = z.enum(["partners", "products"]).safeParse(params.surface)
      if (!result.success) {
        throw notFound()
      }
      return { surface: result.data }
    }
  },
  // Keep unrelated/repeated keys and let malformed values behave like the existing nuqs defaults. Accept the typed
  // navigation value too; coercing arbitrary strings to booleans would make `import=false` open a dialog.
  validateSearch: z.looseObject({
    add: z.enum(["supplier", "forwarder"]).optional().catch(undefined),
    import: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true")
      .optional()
      .catch(undefined)
  }),
  loader: ({ params }) => readQueryControls({ data: params.surface }),
  staleTime: 0,
  gcTime: 0,
  component: QueryControls
})

function QueryControls() {
  const { surface } = Route.useParams()
  const { permissions, allowed, editable } = Route.useLoaderData()
  const router = useRouter()
  const t = useTranslations("common")
  const refresh = () => {
    void router.invalidate()
  }
  let control = <p>{t("pages.forbidden.askAdmin")}</p>
  if (!allowed) {
    control = <PortalForbidden />
  } else if (surface === "products") {
    control = <ProductActions onImported={refresh} />
  } else if (editable) {
    control = <AddPartner />
  }
  return (
    <Providers>
      <AccessProvider permissions={permissions}>
        <main id="main-content" className={panel}>
          <h1>{surface === "partners" ? "Partners" : "Products"}</h1>
          <nav aria-label="Compatibility pages" className="flex gap-4">
            <Link to="/query/$surface" params={{ surface: "partners" }} search={{}}>
              Partners
            </Link>
            <Link to="/query/$surface" params={{ surface: "products" }} search={{}}>
              Products
            </Link>
          </nav>
          {control}
        </main>
      </AccessProvider>
    </Providers>
  )
}
