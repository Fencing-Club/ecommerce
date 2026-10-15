import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { preload } from "react-dom"
import { ClientMessages } from "@/components/client-messages"
import { ThemeScript } from "@/components/theme-provider"
import { direction } from "@/i18n/locales"
import { withRequest } from "@/server/next-request"
import { documentFonts } from "@/styles/document-fonts"
import { skipLink } from "./layout.css"

export const generateMetadata = withRequest(async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return {
    // Each page names itself, such as "Products | Copacker".
    title: { template: "%s | Copacker", default: "Copacker" },
    description: t("appDescription")
  }
})

// What every page shares: the document in the page's language, its fonts and the skip link. The app's stylesheet,
// providers and messages come with its own layouts (AppProviders), and the marketing pages bring only what they use,
// so a visitor's first page carries none of the app. The error page shows outside every other layout, so its messages
// are here.
export default withRequest(async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")])
  const fonts = documentFonts(locale)
  for (const file of fonts.preload) {
    preload(file, { as: "font", type: "font/woff2", crossOrigin: "" })
  }
  return (
    <html lang={locale} dir={direction(locale)} style={fonts.style} suppressHydrationWarning>
      <head>
        <style>{fonts.css}</style>
      </head>
      <body>
        <ThemeScript />
        <a className={skipLink} href="#main-content">
          {t("skipToContent")}
        </a>
        <ClientMessages namespaces={["common.pages.error"]}>{children}</ClientMessages>
      </body>
    </html>
  )
})
