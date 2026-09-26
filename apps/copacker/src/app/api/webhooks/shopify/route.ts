import { randomUUID } from "node:crypto"
import { verifyShopifyWebhook } from "@/server/security"
import { receiveShopifyCompliance, shopifyComplianceTopics } from "@/server/shopify-compliance"
import { receiveShopifyWebhook } from "@/server/shopify-webhooks"

// Shopify's event deliveries. The request is only verified and recorded as queued work, because Shopify expects an
// answer within five seconds and retries anything slower. A topic Copacker doesn't handle is still acknowledged.
// The privacy (compliance) topics arrive here too; the app's settings in Shopify point them at this address.
export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("x-shopify-hmac-sha256")
  if (!verifyShopifyWebhook(body, signature, process.env.SHOPIFY_CLIENT_SECRET ?? "")) {
    return new Response(null, { status: 401 })
  }
  const topic = request.headers.get("x-shopify-topic") ?? ""
  if (shopifyComplianceTopics.some((compliance) => compliance === topic)) {
    const accepted = await receiveShopifyCompliance(
      topic,
      body,
      request.headers.get("x-shopify-webhook-id") || randomUUID()
    )
    return new Response(null, { status: accepted ? 200 : 400 })
  }
  await receiveShopifyWebhook(topic, request.headers.get("x-shopify-shop-domain") ?? "")
  return new Response(null, { status: 200 })
}
