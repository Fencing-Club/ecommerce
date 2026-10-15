import { createRootRoute, HeadContent, Outlet, Scripts, useLocation } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { IntlProvider } from "use-intl"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Copacker migration compatibility" }
    ]
  }),
  component: RuntimeDocument
})

function RuntimeDocument() {
  const location = useLocation()
  const locale = new URLSearchParams(location.searchStr).get("lang") === "ur" ? "ur" : "en"
  return (
    <html lang={locale} dir={locale === "ur" ? "rtl" : "ltr"}>
      <head>
        <HeadContent />
      </head>
      <body>
        <IntlProvider
          locale={locale}
          timeZone="UTC"
          messages={{ common: { appDescription: locale === "ur" ? "منتقلی کی جانچ" : "Migration compatibility" } }}
        >
          <NuqsAdapter>
            <Outlet />
          </NuqsAdapter>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  )
}
