import { NextIntlClientProvider } from "next-intl"

// Gives client components the page's language, messages and time zone. The language is the one chosen in Settings,
// or else the computer's (see src/i18n/request.ts); rendered from a server component, the provider inherits them.
export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>
}
