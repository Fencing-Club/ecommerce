import { ProviderError } from "@repo/copacker-marketplaces/amazon"
import { ShopifyRequestError } from "@repo/copacker-marketplaces/shopify"
import { ProviderHttpError } from "./provider-request"

// Writes one structured log line: the event's name and its fields as JSON, which the service logs index. Fields carry
// identifiers, counts and describeError's account of an error, never a request or response body or a credential.
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ event, ...fields })
  if (level === "info") {
    // Progress isn't a warning or an error, so it's logged as plain output.
    // oxlint-disable-next-line no-console
    console.log(line)
  } else if (level === "warn") {
    console.warn(line)
  } else {
    console.error(line)
  }
}

// A loggable account of an error and its causes. Messages never carry tokens; response bodies are not included.
export function describeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { value: String(error).slice(0, 200) }
  }
  return {
    name: error.name,
    message: error.message.slice(0, 1000),
    ...(error instanceof ProviderHttpError ? { service: error.service } : {}),
    ...(error instanceof ShopifyRequestError || error instanceof ProviderError || error instanceof ProviderHttpError
      ? { status: error.status }
      : {}),
    ...(error.cause !== undefined && depth < 3 ? { cause: describeError(error.cause, depth + 1) } : {})
  }
}
