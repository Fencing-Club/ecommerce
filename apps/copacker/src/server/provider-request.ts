import type { z } from "zod"

// A provider answered with an error status. Only the status and the wait it asked for are kept: never its body, which
// can echo credentials or customer records.
export class ProviderHttpError extends Error {
  override name = "ProviderHttpError"
  constructor(
    readonly service: string,
    readonly status: number,
    readonly retryAfterMs: number | null
  ) {
    super(`${service} request failed (${status})`)
  }
}

type ProviderInit = RequestInit & {
  // How long the whole request may take, on top of any `signal` given.
  timeoutMs: number
  // Tests hand in their own fetch.
  transport?: typeof fetch
}

// Calls a provider's HTTP API. An error status discards the body and throws ProviderHttpError; a success is parsed
// with `schema`, or discarded when there's nothing to read.
export async function providerRequest(service: string, url: string, init: ProviderInit): Promise<void>
export async function providerRequest<T>(
  service: string,
  url: string,
  init: ProviderInit,
  schema: z.ZodType<T>
): Promise<T>
export async function providerRequest<T>(
  service: string,
  url: string,
  { timeoutMs, transport = fetch, signal, ...init }: ProviderInit,
  schema?: z.ZodType<T>
) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const response = await transport(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (!response.ok) {
    await response.body?.cancel()
    throw new ProviderHttpError(service, response.status, retryAfterMs(response.headers.get("retry-after")))
  }
  if (!schema) {
    await response.body?.cancel()
    return
  }
  return schema.parse(await response.json())
}

// Retry-After is either a number of seconds or an HTTP date.
function retryAfterMs(header: string | null, now = Date.now()) {
  if (!header) {
    return null
  }
  const seconds = Number(header)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const at = Date.parse(header)
  return Number.isNaN(at) ? null : Math.max(0, at - now)
}
