import { setCn, ShadcnLocalizationProvider } from "@buildkitgg/shadcn-baseui-kit"
import { useLocale, useTranslations } from "use-intl"
import { direction, isLocale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

// The kit's components merge classes with the app's cn, which knows the app's own utilities (`text-meta`, `focus-ring`,
// `text-link`). Set once, as this module loads, on the server and in the browser alike.
setCn(cn)

// The kit's components in the page's language and direction: their close buttons, sidebar controls, combobox buttons and
// loading status read from common.ui, and they lay out right to left on Urdu pages.
export function KitProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common.ui")
  const locale = useLocale()
  return (
    <ShadcnLocalizationProvider
      direction={isLocale(locale) ? direction(locale) : "ltr"}
      strings={{
        close: t("close"),
        toggleSidebar: t("toggleSidebar"),
        sidebar: t("sidebar"),
        sidebarDescription: t("sidebarDescription"),
        showOptions: t("showOptions"),
        clear: t("clear"),
        removeItem: (label) => t("remove", { label }),
        loading: t("loading")
      }}
    >
      {children}
    </ShadcnLocalizationProvider>
  )
}
