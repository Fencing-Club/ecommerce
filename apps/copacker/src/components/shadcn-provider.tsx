import { DirectionProvider, setCn } from "@buildkitgg/shadcn"
import { useLocale } from "use-intl"
import { direction, isLocale } from "@/i18n/locales"
import { cn } from "@/lib/utils"

// shadcn's components merge classes with the app's cn, which knows the app's own utilities (`text-meta`, `focus-ring`,
// `text-link`). Set once, as this module loads, on the server and in the browser alike.
setCn(cn)

// shadcn's components in the page's direction, so they lay out right to left on Urdu pages. Their built-in labels are
// English, so the app's own wrappers (`overlay-content.tsx`) and props carry the translated ones.
export function ShadcnProvider({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  return <DirectionProvider direction={isLocale(locale) ? direction(locale) : "ltr"}>{children}</DirectionProvider>
}
