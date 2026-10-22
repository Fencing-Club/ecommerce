import { SQSClient } from "@aws-sdk/client-sqs"
import type { Store } from "@/lib/stores"
import { pollAmazonNotifications } from "./amazon-notifications"
import { pollEbayEvents } from "./ebay-events"
import { awsNotificationConfig } from "./integration-config"
import { pollShopifyEvents } from "./shopify-webhooks"
import { sqsQueue } from "./sqs"

// One bounded AWS batch per delivery. Empty queues never query Postgres; full batches schedule another read.
export async function readNotifications(provider: Store) {
  const readers = {
    amazon: { url: process.env.AMAZON_NOTIFICATIONS_QUEUE_URL, poll: pollAmazonNotifications },
    shopify: { url: process.env.SHOPIFY_EVENTS_QUEUE_URL, poll: pollShopifyEvents },
    ebay: { url: process.env.EBAY_EVENTS_QUEUE_URL, poll: pollEbayEvents }
  }
  const reader = readers[provider]
  if (!reader.url) {
    return 0
  }
  const aws = awsNotificationConfig()
  if (!aws) {
    throw new Error("AWS notification credentials are not configured")
  }
  const client = new SQSClient(aws)
  try {
    return await reader.poll(sqsQueue(client, reader.url, 0))
  } finally {
    client.destroy()
  }
}
