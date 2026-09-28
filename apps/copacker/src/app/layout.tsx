import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import type { Metadata } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { Geist, Geist_Mono, Noto_Nastaliq_Urdu, Noto_Sans_Devanagari } from "next/font/google"
import Script from "next/script"
import { LocalizationProvider } from "@/components/localization-provider"
import { Providers } from "@/components/providers"
import { direction, type Locale } from "@/i18n/locales"
import { themeScript } from "@/lib/theme"
import { cn } from "@/lib/utils"
import "@/styles/global.css"
import "./globals.css"
import { skipLink } from "./layout.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false })
// Geist has no Devanagari or Urdu letters, so Hindi and Urdu pages add a font for them after Geist, which still draws
// Latin text such as SKUs. They load only on those pages.
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], preload: false })
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], preload: false })
const scriptFonts: Partial<Record<Locale, string>> = {
  hi: devanagari.style.fontFamily,
  ur: nastaliq.style.fontFamily
}
// React's CSSProperties has no custom properties, so the Geist variable is typed through it.
const fontStack = (scriptFont: string) =>
  ({ "--font-geist-sans": `${geistSans.style.fontFamily}, ${scriptFont}` }) as React.CSSProperties

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common")
  return {
    // Each page names itself, such as "Products | Copacker".
    title: { template: "%s | Copacker", default: "Copacker" },
    description: t("appDescription")
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("common")])
  const scriptFont = scriptFonts[locale]
  return (
    <html
      lang={locale}
      dir={direction(locale)}
      className={cn(geistSans.variable, geistMono.variable)}
      style={scriptFont ? fontStack(scriptFont) : undefined}
      suppressHydrationWarning
    >
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <a className={skipLink} href="#main-content">
          {t("skipToContent")}
        </a>
        <LocalizationProvider>
          <AuthKitProvider>
            <Providers>{children}</Providers>
          </AuthKitProvider>
        </LocalizationProvider>
      </body>
    </html>
  )
}
