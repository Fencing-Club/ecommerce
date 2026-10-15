// Use the reader's locale to distinguish currencies that share a symbol, such as USD and CAD.
export function currencySymbol(currency: string, locale: string) {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? currency
  )
}
