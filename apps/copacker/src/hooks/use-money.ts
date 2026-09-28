import { money } from "@repo/aisle"
import { useLocale } from "next-intl"

// Money in minor units, as Copacker stores it, written in the page's language: $1,234.50, 1.234,50 $.
export function useMoney() {
  const locale = useLocale()
  return (minor: number, currency = "USD") => money(minor, currency, locale)
}
