import { z } from "zod"

// The marketplaces currently read through Copacker's North American SP-API client.
export const amazonMarketplaceSchema = z.enum(["US", "CA", "MX", "BR"])
export const amazonMarketplaces = amazonMarketplaceSchema.options
const sellerCentral = {
  US: "sellercentral.amazon.com",
  CA: "sellercentral.amazon.ca",
  MX: "sellercentral.amazon.com.mx",
  BR: "sellercentral.amazon.com.br"
}

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
  const target = new URL(`https://${sellerCentral[country]}/apps/authorize/consent`)
  target.search = new URLSearchParams({
    application_id: applicationId,
    state,
    redirect_uri: callback,
    ...(draft ? { version: "beta" } : {})
  }).toString()
  return target
}
