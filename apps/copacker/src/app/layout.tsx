import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import { themeScript } from "@/lib/theme"
import { cn } from "@/lib/utils"
import "@/styles/global.css"
import { skipLink } from "./layout.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Copacker | Purchase orders to pickup",
  description: "A shared workspace for buyers and suppliers to prepare Amazon shipments."
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable)} suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
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
