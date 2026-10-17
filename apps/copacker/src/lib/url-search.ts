import { z } from "zod"

const scalar = z.union([z.string(), z.number(), z.boolean()])
const searchValue = z.union([scalar, z.array(scalar)]).nullish()

// Keep the existing HTTP URL contract: repeated keys are repeated values, and opaque strings (IDs, search text and
// provider state) are never interpreted as JSON. Each route validates only the keys it owns.
export function parseUrlSearch(value: string): Record<string, string | string[]> {
  const params = new URLSearchParams(value)
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key)
      return [key, values.length === 1 ? values[0]! : values]
    })
  )
}

export function stringifyUrlSearch(value: Record<string, unknown>) {
  const params = new URLSearchParams()
  for (const [key, raw] of Object.entries(value)) {
    const entry = searchValue.parse(raw)
    if (entry === undefined || entry === null) {
      continue
    }
    for (const item of Array.isArray(entry) ? entry : [entry]) {
      params.append(key, String(item))
    }
  }
  return params.size ? `?${params}` : ""
}
