import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { IntlProvider } from "use-intl"
import { ThemeScript } from "@/components/theme-provider"
import { direction } from "@/i18n/locales"
import { documentFonts } from "@/styles/document-fonts"
import { readDocument } from "../document.functions"
import { skipLink } from "@/app/layout.css"
import "@/styles/global.css"
import "@/app/globals.css"

export const Route = createRootRoute({
  loader: () => readDocument(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "same-origin" },
      { title: "Copacker migration compatibility" }
    ]
  }),
  component: RuntimeDocument
})

function RuntimeDocument() {
  const { maintenance, ...config } = Route.useLoaderData()
  const fonts = documentFonts(config.locale)
  return (
    <html
      lang={config.locale}
      dir={direction(config.locale)}
      style={fonts.style}
      data-maintenance={maintenance || undefined}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <style>{fonts.css}</style>
        {fonts.preload.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" crossOrigin="" href={href} />
        ))}
      </head>
      <body>
        <ThemeScript />
        <a className={skipLink} href="#main-content">
          {config.messages.common.skipToContent}
        </a>
        <IntlProvider {...config}>
          <NuqsAdapter>
            <Outlet />
          </NuqsAdapter>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  )
}
