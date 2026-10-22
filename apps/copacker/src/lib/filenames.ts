// Text people typed, such as an order reference, safe in a file name: no characters file systems reject, and no line
// breaks.
export const filenamePart = (value: string) =>
  value
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, "-")
    .replace(/\s+/g, " ")
    .trim()
