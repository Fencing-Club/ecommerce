// How long an item's stock lasts at its recent sales rate, in the groups the Overview and Restock share.
export const coverBuckets = [
  { key: "out", label: "Out of stock" },
  { key: "under14", label: "Under 2 weeks" },
  { key: "under30", label: "2 to 4 weeks" },
  { key: "under60", label: "1 to 2 months" },
  { key: "under90", label: "2 to 3 months" },
  { key: "over90", label: "Over 3 months" },
  { key: "unsold", label: "Not selling" }
] as const
export type CoverBucket = (typeof coverBuckets)[number]["key"]

export function isCoverBucket(value: string | null | undefined): value is CoverBucket {
  return coverBuckets.some((bucket) => bucket.key === value)
}

export function coverBucket(line: {
  available: number | null
  sold: number | null
  daysRemaining: number | null
}): CoverBucket | null {
  if (line.available === null) {
    return null
  }
  if (line.available <= 0) {
    return "out"
  }
  if (line.sold === 0) {
    return "unsold"
  }
  if (line.daysRemaining === null) {
    return null
  }
  if (line.daysRemaining < 14) {
    return "under14"
  }
  if (line.daysRemaining < 30) {
    return "under30"
  }
  if (line.daysRemaining < 60) {
    return "under60"
  }
  return line.daysRemaining < 90 ? "under90" : "over90"
}
