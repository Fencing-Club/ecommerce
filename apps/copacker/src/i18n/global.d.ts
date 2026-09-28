import type { Locale } from "./locales"
import type { Messages } from "./messages"

// Types every useTranslations/getTranslations call against the English messages, so a missing key fails type-checking.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
