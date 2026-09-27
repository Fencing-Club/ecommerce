import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"
import "@/styles/global.css"
import { skipLink } from "./layout.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Copacker | Purchase orders to pickup",
  description: "A shared workspace for buyers and suppliers to prepare Amazon shipments."
}

// Follows the computer's light or dark setting, before the page paints and whenever it changes.
const colorScheme = `(() => {
  const dark = matchMedia("(prefers-color-scheme: dark)")
  const apply = () => document.documentElement.classList.toggle("dark", dark.matches)
  apply()
  dark.addEventListener("change", apply)
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable)} suppressHydrationWarning>
      <body>
        <Script id="color-scheme" strategy="beforeInteractive">
          {colorScheme}
        </Script>
        <a className={skipLink} href="#main-content">
          Skip to content
        </a>
        <AuthKitProvider>
          <Providers>{children}</Providers>
        </AuthKitProvider>
      </body>
    </html>
  )
}
