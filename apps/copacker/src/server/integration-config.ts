import { z } from "zod"

// Integration settings from the environment. Each section is read when it's needed, so a test or a Worker binding that
// sets the environment later still counts, and is null when it isn't fully configured.
function section<T>(schema: z.ZodType<T>, read: () => unknown) {
  return (): T | null => {
    const parsed = schema.safeParse(read())
    return parsed.success ? parsed.data : null
  }
}

const value = z.string().min(1)

// Resend, which sends every email.
export const emailConfig = section(z.object({ apiKey: value, from: value }), () => ({
  apiKey: process.env.EMAIL_API_KEY,
  from: process.env.EMAIL_FROM
}))

// Langfuse, which holds the import prompt and receives import traces. Its keys only ever go over HTTPS.
export const langfuseConfig = section(
  z
    .object({ baseUrl: z.url({ protocol: /^https$/ }), publicKey: value, secretKey: value })
    .transform(({ baseUrl, publicKey, secretKey }) => ({
      origin: new URL(baseUrl).origin,
      authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`
    })),
  () => ({
    baseUrl: process.env.LANGFUSE_BASE_URL,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY
  })
)

// OpenRouter, which runs the purchase order import's model.
export const openRouterConfig = section(z.object({ apiKey: value }), () => ({
  apiKey: process.env.OPENROUTER_API_KEY
}))

// The AWS credentials that read provider notifications from SQS. They're separate from the web EventBridge publisher's.
export const awsNotificationConfig = section(
  z.object({
    region: value,
    credentials: z.object({ accessKeyId: value, secretAccessKey: value, sessionToken: value.optional() })
  }),
  () => ({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_NOTIFICATION_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_NOTIFICATION_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_NOTIFICATION_SESSION_TOKEN || undefined
    }
  })
)

// Cloudflare's queue API, which administrative Node tools publish job wakes through. Hosted Workers use bindings.
export const jobQueueConfig = section(
  z.object({
    account: z.string().regex(/^[a-f0-9]{32}$/),
    queue: z.string().regex(/^[a-f0-9]{32}$/),
    token: value
  }),
  () => ({
    account: process.env.CLOUDFLARE_ACCOUNT_ID,
    queue: process.env.CLOUDFLARE_JOBS_QUEUE_ID,
    token: process.env.CLOUDFLARE_JOBS_TOKEN
  })
)
