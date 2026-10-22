import type { SQSClient } from "@aws-sdk/client-sqs"
import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs"

// Amazon notifications and Shopify's EventBridge deliveries both arrive in SQS queues that the worker reads.
export type NotificationQueue = {
  receive(): Promise<{ body: string; handle: string }[]>
  remove(handle: string): Promise<void>
}
export function sqsQueue(sqs: SQSClient, queueUrl: string, waitTimeSeconds = 20): NotificationQueue {
  return {
    async receive() {
      // Long polling: waits up to 20 seconds for a message, so an empty queue costs few requests.
      const { Messages = [] } = await sqs.send(
        new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitTimeSeconds })
      )
      return Messages.flatMap((message) =>
        message.ReceiptHandle ? [{ body: message.Body ?? "", handle: message.ReceiptHandle }] : []
      )
    },
    async remove(handle) {
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: handle }))
    }
  }
}

// Reads one batch of messages and handles each. A message is removed only after it's handled. One that fails stays in
// the queue to be tried again, and moves to the queue's dead-letter queue once it keeps failing. The rest of the batch
// is still handled, so a failing message doesn't hold back the others or use up their tries, and then the first failure
// is thrown.
export async function pollQueue(queue: NotificationQueue, handle: (body: string) => Promise<unknown>) {
  const messages = await queue.receive()
  let failed: { error: unknown } | null = null
  for (const message of messages) {
    try {
      await handle(message.body)
    } catch (error) {
      failed ??= { error }
      continue
    }
    await queue.remove(message.handle)
  }
  if (failed) {
    throw failed.error
  }
  return messages.length
}

// A queue's ARN, from its URL (https://sqs.<region>.amazonaws.com/<account>/<name>).
export function queueArn(queueUrl: string) {
  const match = queueUrl.match(/^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/(\d{12})\/([A-Za-z0-9_-]{1,80})$/)
  if (!match) {
    throw new Error("The queue URL isn't an SQS queue URL")
  }
  return `arn:aws:sqs:${match[1]}:${match[2]}:${match[3]}`
}
