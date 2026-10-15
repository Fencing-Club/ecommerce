import { writeFile } from "node:fs/promises"
import { z } from "zod"

// Google libaddressinput address metadata, CC BY 4.0. See docs/auth.md for attribution.
const root = "https://chromium-i18n.appspot.com/ssl-address/data"
const schema = z.object({
  countries: z.string().optional(),
  lang: z.string().optional(),
  sub_keys: z.string().optional(),
  sub_names: z.string().optional(),
  sub_lnames: z.string().optional()
})
async function read(path: string) {
  const response = await fetch(`${root}${path}`)
  if (!response.ok) {
    throw new Error(`Address metadata ${path}: ${response.status}`)
  }
  return schema.parse(await response.json())
}
const countries = (await read("")).countries?.split("~") ?? []
if (!countries.length) {
  throw new Error("No address metadata countries returned")
}
const result: Record<string, Array<{ value: string; label: string; native: string; language: string }>> = {}
for (let offset = 0; offset < countries.length; offset += 8) {
  await Promise.all(
    countries.slice(offset, offset + 8).map(async (country) => {
      const data = await read(`/${country}`)
      const keys = data.sub_keys?.split("~") ?? []
      const names = data.sub_names?.split("~") ?? keys
      const latin = data.sub_lnames?.split("~") ?? names
      result[country] = keys.map((value, index) => ({
        value,
        label: latin[index] || names[index] || value,
        native: names[index] || value,
        language: data.lang ?? ""
      }))
    })
  )
}
await writeFile(
  new URL("../src/lib/address-regions.json", import.meta.url),
  `${JSON.stringify(Object.fromEntries(Object.entries(result).sort()), null, 2)}\n`
)
