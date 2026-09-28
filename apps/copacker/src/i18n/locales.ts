// The languages Copacker is translated into. English is the source every other language is translated from, and it
// fills any message a translation doesn't have yet. Urdu is written right to left (see `direction`).
export const locales = ["en", "es-MX", "fr", "de", "it", "uk", "zh-CN", "hi", "ur"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"

// Each language named in itself, as a language picker lists them.
export const localeNames: Record<Locale, string> = {
  en: "English",
  "es-MX": "Español (México)",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  uk: "Українська",
  "zh-CN": "简体中文",
  hi: "हिन्दी",
  ur: "اردو"
}

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value)
}

// The best supported language for an Accept-Language header, which browsers fill from the computer's languages:
// "de-AT,de;q=0.9,en;q=0.8" is German. A regional variant falls back to its language (es-ES to Mexican Spanish), and
// every Chinese variant to Simplified Chinese, which Traditional readers read better than English.
export function negotiateLocale(acceptLanguage: string | null): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";")
      const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean)
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), index }
    })
    .filter(({ tag, q }) => tag && tag !== "*" && q > 0)
    .toSorted((a, b) => b.q - a.q || a.index - b.index)
  for (const { tag } of wanted) {
    const match = matchLocale(tag)
    if (match) {
      return match
    }
  }
  return defaultLocale
}

function matchLocale(tag: string): Locale | undefined {
  const exact = locales.find((locale) => locale.toLowerCase() === tag)
  if (exact) {
    return exact
  }
  const language = tag.split("-")[0]
  return locales.find((locale) => locale.split("-")[0] === language)
}

// Urdu reads right to left; the root layout sets the page's dir from this.
export function direction(locale: Locale) {
  return locale === "ur" ? "rtl" : "ltr"
}
