import { z } from "zod"

// The US marketplace, where Copacker's FBA and AWD stock, inbound shipments and reports live.
export const usMarketplaceId = "ATVPDKIKX0DER"

// The North American marketplaces Copacker reads through its SP-API client: the US, Canada, Mexico and Brazil. They
// share one seller account and one endpoint. `salesChannel` is how Amazon's order report names a marketplace, and
// `code` how Copacker's channel filter does. This module has no Node dependencies, so the browser can load it.
export const amazonMarketplaces = [
  {
    country: "US",
    salesChannel: "Amazon.com",
    code: "us",
    id: usMarketplaceId,
    label: "Amazon US",
    sellerCentral: "sellercentral.amazon.com"
  },
  {
    country: "CA",
    salesChannel: "Amazon.ca",
    code: "ca",
    id: "A2EUQ1WTGCTBG2",
    label: "Amazon Canada",
    sellerCentral: "sellercentral.amazon.ca"
  },
  {
    country: "MX",
    salesChannel: "Amazon.com.mx",
    code: "mx",
    id: "A1AM78C64UM0Y8",
    label: "Amazon Mexico",
    sellerCentral: "sellercentral.amazon.com.mx"
  },
  {
    country: "BR",
    salesChannel: "Amazon.com.br",
    code: "br",
    id: "A2Q3Y263D00KWC",
    label: "Amazon Brazil",
    sellerCentral: "sellercentral.amazon.com.br"
  }
] as const
export type AmazonMarketplace = (typeof amazonMarketplaces)[number]

export const amazonMarketplaceSchema = z.enum(["US", "CA", "MX", "BR"])
export type AmazonCountry = z.infer<typeof amazonMarketplaceSchema>

export function amazonMarketplace(country: AmazonCountry) {
  const marketplace = amazonMarketplaces.find((entry) => entry.country === country)
  if (!marketplace) {
    throw new Error(`Unknown Amazon marketplace ${country}`)
  }
  return marketplace
}

// Seller Central's page where a seller authorizes the app. `draft` asks for the app's draft (beta) version.
export function amazonConsentUrl({
  marketplace,
  applicationId,
  state,
  callback,
  draft
}: {
  marketplace: string
  applicationId: string
  state: string
  callback: string
  draft: boolean
}) {
  const country = amazonMarketplaceSchema.parse(marketplace)
  const target = new URL(`https://${amazonMarketplace(country).sellerCentral}/apps/authorize/consent`)
  target.search = new URLSearchParams({
    application_id: applicationId,
    state,
    redirect_uri: callback,
    ...(draft ? { version: "beta" } : {})
  }).toString()
  return target
}
