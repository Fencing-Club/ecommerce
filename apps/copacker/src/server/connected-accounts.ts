import { z } from "zod"
import { amazonFor, ebayFor, shopifyFor } from "./connections"
import { amazonMarketplaces } from "./overview-sales"
import { amazonSellerAccount } from "./sales-orders"

// What Settings shows about each connected account. Read live, kept for a few hours, and never enough to stop
// Settings loading: each falls back to what Copacker already stores.

// Amazon's marketplaces by country, on a card that already says Amazon.
const countries: Record<(typeof amazonMarketplaces)[number]["code"], string> = {
  us: "United States",
  ca: "Canada",
  mx: "Mexico",
  br: "Brazil"
}

const shopNames = new Map<string, { name: string; at: number }>()

// The Shopify store's name, or its myshopify.com domain when Shopify can't be reached.
export async function shopifyStoreName(orgId: string, domain: string, now = Date.now()) {
  const cached = shopNames.get(domain)
  if (cached && now - cached.at < 6 * 3600000) {
    return cached.name
  }
  try {
    const result = z
      .object({ shop: z.object({ name: z.string() }) })
      .parse(await (await shopifyFor(orgId, domain)).graphql("query ShopName{shop{name}}"))
    shopNames.set(domain, { name: result.shop.name, at: now })
    return result.shop.name
  } catch (error) {
    console.warn("Couldn't read the Shopify store name", error)
    return domain
  }
}

const ebayUsernames = new Map<string, { name: string; at: number }>()

// The eBay seller's username (Copacker keeps their immutable user ID), or null when eBay can't be reached.
export async function ebayUsername(orgId: string, userId: string, now = Date.now()) {
  const cached = ebayUsernames.get(userId)
  if (cached && now - cached.at < 6 * 3600000) {
    return cached.name
  }
  try {
    const { username } = await (await ebayFor(orgId, userId)).user()
    ebayUsernames.set(userId, { name: username, at: now })
    return username
  } catch (error) {
    console.warn("Couldn't read the eBay username", error)
    return null
  }
}

// The Amazon store's name and the North American marketplaces it sells in, which Copacker reads orders from. Null
// when Amazon can't be reached.
export async function amazonStore(orgId: string, sellerId: string) {
  try {
    const account = await amazonSellerAccount(sellerId, await amazonFor(orgId))
    return {
      name: account.storeName,
      marketplaces: amazonMarketplaces
        .filter((marketplace) => account.marketplaceIds.includes(marketplace.id))
        .map((marketplace) => countries[marketplace.code])
    }
  } catch (error) {
    console.warn("Couldn't read the Amazon store", error)
    return null
  }
}
