import { useMounted } from "@mantine/hooks"
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { IntlProvider } from "use-intl"
import ErrorPage from "@/app/error"
import NotFound from "@/app/not-found"
import { ThemeScript } from "@/components/theme-script"
import { direction } from "@/i18n/locales"
import { documentFonts } from "@/styles/document-fonts"
import common from "../../messages/en/common.json"
import { readDocument } from "../document.functions"
import "@/styles/theme.css"
import "@/app/globals.css"

export const Route = createRootRoute({
  loader: ({ location }) => readDocument({ data: location.pathname }),
  shouldReload: true,
  head: ({ loaderData, matches }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "referrer", content: "same-origin" },
      ...(loaderData?.head.meta ?? [{ title: "Copacker" }]),
      ...(matches.some((match) => match._notFound || match.status === "notFound")
        ? [{ title: `${loaderData?.messages.common.pages.notFound.title ?? common.pages.notFound.title} | Copacker` }]
        : [])
    ],
    links: loaderData?.head.links
  }),
  shellComponent: Document,
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ({ reset }) => <ErrorPage retry={reset} />
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
        <IntlProvider {...config}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  )
}
