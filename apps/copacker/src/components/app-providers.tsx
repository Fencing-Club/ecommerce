import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { LocalizationProvider } from "@/components/localization-provider"
import { Providers } from "@/components/providers"
// The reset comes first: it declares the layer Tailwind's layers then override.
import "@/styles/global.css"
import "@/app/globals.css"

// What the app's pages share: its stylesheet, every area's messages for its client components, AuthKit, the theme,
// the data cache, tooltips, and state kept in the URL (a list's view, filters and sort, and which sheet or dialog is
// open). Each of the app's layouts renders it. The marketing pages don't, so a visitor's first page downloads none of
// it. Storybook gives each story its own URL state instead.
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LocalizationProvider>
      <AuthKitProvider>
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </AuthKitProvider>
    </LocalizationProvider>
  )
}
