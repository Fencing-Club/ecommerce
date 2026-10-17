import { ReceiveMessageCommand, DeleteMessageCommand, SQSClient } from "@aws-sdk/client-sqs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { readNotifications } from "../src/server/notification-reader"
import { pollQueue, sqsQueue } from "../src/server/sqs"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe("bounded notification reading", () => {
  it("skips unconfigured providers without opening a client", async () => {
    vi.stubEnv("SHOPIFY_EVENTS_QUEUE_URL", "")
    const send = vi.spyOn(SQSClient.prototype, "send")
    expect(await readNotifications("shopify")).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
  it("uses explicit credentials and a nonblocking ten-message batch, then closes the client", async () => {
    vi.stubEnv("SHOPIFY_EVENTS_QUEUE_URL", "https://sqs.us-west-2.amazonaws.com/123456789012/events")
    vi.stubEnv("AWS_REGION", "us-west-2")
    vi.stubEnv("AWS_NOTIFICATION_ACCESS_KEY_ID", "fixture")
    vi.stubEnv("AWS_NOTIFICATION_SECRET_ACCESS_KEY", "fixture")
    const send = vi.spyOn(SQSClient.prototype, "send").mockImplementation(async () => ({ Messages: [] }))
    const close = vi.spyOn(SQSClient.prototype, "destroy")
    expect(await readNotifications("shopify")).toBe(0)
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(ReceiveMessageCommand)
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ MaxNumberOfMessages: 10, WaitTimeSeconds: 0 })
    expect(close).toHaveBeenCalledOnce()
    send.mockRejectedValueOnce(new Error("AWS unavailable"))
    await expect(readNotifications("shopify")).rejects.toThrow("AWS unavailable")
    expect(close).toHaveBeenCalledTimes(2)
  })
  it("deletes only successfully processed AWS messages", async () => {
    const client = new SQSClient({ region: "us-west-2" })
    const send = vi
      .spyOn(client, "send")
      .mockImplementationOnce(async () => ({
        Messages: [
          { Body: "saved", ReceiptHandle: "first" },
          { Body: "failed", ReceiptHandle: "second" }
        ]
      }))
      .mockImplementation(async () => ({}))
    await expect(
      pollQueue(sqsQueue(client, "fixture", 0), async (body) => {
        if (body === "failed") {
          throw new Error("database unavailable")
        }
      })
    ).rejects.toThrow("database unavailable")
    const deletes = send.mock.calls.filter(([command]) => command instanceof DeleteMessageCommand)
    expect(deletes).toHaveLength(1)
    expect(deletes[0]?.[0].input).toMatchObject({ ReceiptHandle: "first" })
    client.destroy()
  })
})
