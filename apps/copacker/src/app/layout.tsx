import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { Geist, Geist_Mono } from "next/font/google"
import { preload } from "react-dom"
import { ClientMessages } from "@/components/client-messages"
import { ThemeScript } from "@/components/theme-provider"
import { direction, type Locale } from "@/i18n/locales"
import { cn } from "@/lib/utils"
import geistCyrillic from "@/styles/fonts/geist-cyrillic.woff2"
import nastaliq from "@/styles/fonts/noto-nastaliq-urdu.woff2"
import devanagari from "@/styles/fonts/noto-sans-devanagari.woff2"
import { skipLink } from "./layout.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false })

// The letters Geist's Latin face lacks, for the pages whose language needs them: Geist's own Cyrillic, and fonts for
// Devanagari and Urdu, which Geist doesn't have. Each is a single file, so the page preloads it with the HTML, and its
// text is set in it from the first paint rather than moving when it arrives. It comes first in the page's font stack,
// ahead of Geist, which still draws the Latin text such as SKUs, and of Geist's fallback, which would draw Urdu in Arial.
// The files are Google Fonts' own subsets. They're kept here, not loaded through next/font, which doesn't give out a
// font file's address to preload it for one language.
type Face = { family: string; file: string; weight: string; unicodeRange: string }
const localeFaces: Partial<Record<Locale, Face>> = {
  uk: {
    family: "Geist Cyrillic",
    file: geistCyrillic,
    weight: "100 900",
    unicodeRange: "U+301, U+400-45F, U+490-491, U+4B0-4B1, U+2116"
  },
  hi: {
    family: "Noto Sans Devanagari",
    file: devanagari,
    weight: "100 900",
    unicodeRange: "U+900-97F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF"
  },
  ur: {
    family: "Noto Nastaliq Urdu",
    file: nastaliq,
    weight: "400 700",
    unicodeRange: "U+600-6FF, U+750-77F, U+870-8FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FEFC"
  }
}
// The face's rule. React escapes quotes in a style element's text, so the names and address go unquoted.
const fontFace = ({ family, file, weight, unicodeRange }: Face) =>
  `@font-face{font-family:${family};font-weight:${weight};font-display:swap;src:url(${file});unicode-range:${unicodeRange}}`
// React's CSSProperties has no custom properties, so the Geist variable is typed through it.
const fontStack = ({ family }: Face) =>
  ({ "--font-geist-sans": `${family}, ${geistSans.style.fontFamily}` }) as React.CSSProperties

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return {
    // Each page names itself, such as "Products | Copacker".
    title: { template: "%s | Copacker", default: "Copacker" },
    description: t("appDescription")
  }
}

// What every page shares: the document in the page's language, its fonts and the skip link. The app's stylesheet,
// providers and messages come with its own layouts (AppProviders), and the marketing pages bring only what they use,
// so a visitor's first page carries none of the app. The error page shows outside every other layout, so its messages
// are here.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")])
  const face = localeFaces[locale]
  if (face) {
    preload(face.file, { as: "font", type: "font/woff2", crossOrigin: "" })
  }
  return (
    <html
      lang={locale}
      dir={direction(locale)}
      className={cn(geistSans.variable, geistMono.variable)}
      style={face ? fontStack(face) : undefined}
      suppressHydrationWarning
    >
      {face && (
        <head>
          <style>{fontFace(face)}</style>
        </head>
      )}
      <body>
        <ThemeScript />
        <a className={skipLink} href="#main-content">
          {t("skipToContent")}
        </a>
        <ClientMessages namespaces={["common.pages.error"]}>{children}</ClientMessages>
      </body>
    </html>
  )
}
