import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import { LocalizationProvider } from "@/components/localization-provider"
import { Providers } from "@/components/providers"
// The reset comes first: it declares the layer Tailwind's layers then override.
import "@/styles/global.css"
import "@/app/globals.css"

// What the app's pages share: its stylesheet, every area's messages for its client components, AuthKit, the theme,
// the data cache and tooltips. Each of the app's layouts renders it. The marketing pages don't, so a visitor's first
// page downloads none of it.
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LocalizationProvider>
      <AuthKitProvider>
        <Providers>{children}</Providers>
      </AuthKitProvider>
    </LocalizationProvider>
  )
}
