import type { Address } from "@repo/copacker-orders"

// The companies the stories show, and where they are: Harbor Goods buys, Lotus Manufacturing and Northwind Textiles
// make the goods, and Bayline Freight forwards them. Mei Chen is the factories' contact.

// Lotus Manufacturing's factory in Yiwu.
export const lotusFactory: Address = {
  name: "Mei Chen",
  phoneNumber: "+8657985551234",
  email: "mei@lotus.example.com",
  addressLine1: "1000 Siji Road",
  addressLine2: "Building 3",
  city: "Yiwu",
  stateOrRegion: "Zhejiang",
  postalCode: "322000",
  countryCode: "CN"
}

// Northwind Textiles' factory in Ningbo.
export const northwindFactory: Address = {
  name: "Mei Chen",
  phoneNumber: "+8657455550100",
  email: "",
  addressLine1: "88 Harbour Road",
  addressLine2: "",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315000",
  countryCode: "CN"
}

// Bayline Freight's warehouse in Ningbo, where shipments wait to go on together.
export const baylineWarehouse: Address = {
  name: "Bayline Freight",
  phoneNumber: "+865745550188",
  email: "",
  addressLine1: "18 Gangqiao Road",
  addressLine2: "Beilun",
  city: "Ningbo",
  stateOrRegion: "Zhejiang",
  postalCode: "315800",
  countryCode: "CN"
}

// Bayline Freight's consolidation warehouse in Shenzhen.
export const baylineShenzhen: Address = {
  name: "Wei Zhang",
  phoneNumber: "+8675555501234",
  email: "",
  addressLine1: "88 Harbor Road",
  addressLine2: "",
  city: "Shenzhen",
  stateOrRegion: "Guangdong",
  postalCode: "518000",
  countryCode: "CN"
}

// Harbor Goods' warehouse in Portland.
export const harborWarehouse: Address = {
  name: "Jordan Lee",
  phoneNumber: "+15035550142",
  email: "receiving@harbor.example.com",
  addressLine1: "2400 NW Front Ave",
  addressLine2: "",
  city: "Portland",
  stateOrRegion: "OR",
  postalCode: "97209",
  countryCode: "US"
}
