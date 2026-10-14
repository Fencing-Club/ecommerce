import data from "./address-regions.json"

const regionsByCountry: Record<string, Array<{ value: string; label: string; native: string; language: string }>> = data

// Google libaddressinput postal regions (CC BY 4.0); a bundled snapshot needs no live request or API key.
export function addressRegions(country: string, locale: string) {
  const code = country.toUpperCase()
  return (regionsByCountry[code] ?? []).map((region) => ({
    value: region.value,
    label: locale.split("-")[0] === region.language.split("-")[0] ? region.native : region.label,
    aliases: [region.value, region.label, region.native]
  }))
}
