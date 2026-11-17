import { useMounted } from "@mantine/hooks"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { IntlProvider } from "use-intl"
import NotFound from "@/app/not-found"
import { ShadcnProvider } from "@/components/shadcn-provider"
import { ThemeScript } from "@/components/theme-script"
import { direction } from "@/i18n/locales"
import { documentKey } from "@/lib/document-key"
import { pageTitle } from "@/lib/page-title"
import { documentFonts } from "@/styles/document-fonts"
import common from "../../messages/en/common.json"
import { readDocument } from "../document.functions"
// Tailwind with shadcn's stylesheet, then the theme's colors, which override shadcn's defaults.
import "@/app/globals.css"
import "@/styles/theme.css"

// The document key the page in the browser was rendered with. The server only ever loads a document afresh.
const renderedDocument = createIsomorphicFn()
  .server(() => undefined)
  .client(() => document.documentElement.dataset.document)

export const Route = createRootRoute({
  loader: ({ location }) => readDocument({ data: location.pathname }),
  // The document's messages and head are the same for every page with the same key, such as every portal page, so a
  // navigation between them keeps what's loaded. Invalidating the router still reads them again.
  shouldReload: ({ location }) => documentKey(location.pathname) !== renderedDocument(),
  head: ({ loaderData, matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "same-origin" },
      ...(loaderData?.head.meta ?? [{ title: pageTitle() }]),
      ...(matches.some((match) => match._notFound || match.status === "notFound")
        ? [{ title: pageTitle(loaderData?.messages.common.pages.notFound.title ?? common.pages.notFound.title) }]
        : [])
    ],
    links: loaderData?.head.links
  }),
  shellComponent: Document,
  component: Outlet,
  notFoundComponent: NotFound
})

// Hidden until a keyboard reaches it, then pinned to the page's top start corner.
const skipLink =
  "sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"

function Document({ children }: { children: React.ReactNode }) {
  const hydrated = useMounted()
  const result = Route.useLoaderData()
  const config = result ?? { locale: "en" as const, messages: { common }, timeZone: "UTC" }
  const fonts = documentFonts(config.locale)
  return (
    <html
      lang={config.locale}
      dir={direction(config.locale)}
      style={fonts.style}
      data-maintenance={result?.maintenance || undefined}
      data-document={result?.key}
      data-hydrated={hydrated || undefined}
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
        <a href="#main-content" className={skipLink}>
          {config.messages.common.skipToContent}
        </a>
        <IntlProvider key={result?.key} locale={config.locale} messages={config.messages} timeZone={config.timeZone}>
          <ShadcnProvider>
            <NuqsAdapter>{children}</NuqsAdapter>
          </ShadcnProvider>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  )
}
