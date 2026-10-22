import type { Address } from "@repo/copacker-orders"

type Place = Partial<
  Pick<Address, "addressLine1" | "addressLine2" | "city" | "stateOrRegion" | "postalCode" | "countryCode">
>

// An address's lines, as a document prints them: "1000 Siji Road", "Building 3", "Yiwu, Zhejiang 322000", "CN",
// leaving out what isn't known.
export function addressLines(address: Place) {
  return [
    address.addressLine1,
    address.addressLine2,
    [address.city, [address.stateOrRegion, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    address.countryCode
  ].filter((line): line is string => Boolean(line))
}

// An address on one line, as lists and summaries show it: "1000 Siji Road, Building 3, Yiwu, Zhejiang 322000, CN".
export function addressLine(address: Place) {
  return addressLines(address).join(", ")
}
