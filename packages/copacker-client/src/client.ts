import {
  asyncResultSchema,
  contractVersion,
  errorEnvelopeSchema,
  isQuery,
  jsonObject,
  operationDescriptorSchema,
  operationName,
  pageSchema,
  successEnvelopeSchema,
  type ErrorEnvelope,
  type JsonObject,
  type OperationDescriptor,
  type SuccessEnvelope
} from "@repo/copacker-contract"
import { z } from "zod"

export class CopackerError extends Error {
  readonly envelope: ErrorEnvelope
  readonly status: number
  constructor(envelope: ErrorEnvelope, status = 500) {
    super(envelope.error.message)
    this.name = "CopackerError"
    this.envelope = envelope
    this.status = status
  }
}
export function clientError(code: string, message: string, status = 400, details: JsonObject = {}): CopackerError {
  return new CopackerError(
    {
      error: { code, message, details, retryable: code === "transport_error", issues: [], recovery: null },
      meta: { requestId: "client", workspaceId: null }
    },
    status
  )
}

export function apiOrigin(value: string): string {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw clientError("invalid_input", "The API URL must be an origin without credentials, a path, query or fragment.")
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw clientError("invalid_input", "Use HTTPS, or HTTP on a loopback address for local development.")
  }
  return url.origin
}

export interface ClientOptions {
  baseUrl: string
  token: string | (() => Promise<string>)
  workspaceId?: string
  fetch?: typeof fetch
  timeoutMs?: number
  attempts?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}
export interface CallOptions {
  idempotencyKey?: string
  signal?: AbortSignal
  descriptor?: OperationDescriptor
}

export const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const abort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", abort, { once: true })
  })

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) {
    throw clientError("unsupported_contract", "The server returned an empty response.", 409)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      size += chunk.value.byteLength
      if (size > 32 * 1024 * 1024) {
        throw clientError("unsupported_contract", "The server response is too large.", 409)
      }
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw clientError("unsupported_contract", "The server did not return the Copacker JSON contract.", 409)
  }
}

export class CopackerClient {
  readonly baseUrl: string
  readonly workspaceId?: string
  private readonly options: ClientOptions
  private readonly descriptors = new Map<string, OperationDescriptor>()
  constructor(options: ClientOptions) {
    this.baseUrl = apiOrigin(options.baseUrl)
    this.workspaceId = options.workspaceId
    this.options = options
  }

  async authorization(): Promise<string> {
    const token = typeof this.options.token === "function" ? await this.options.token() : this.options.token
    if (!token || /[\r\n]/.test(token)) {
      throw clientError("unauthenticated", "Sign in or supply COPACKER_TOKEN.", 401)
    }
    return `Bearer ${token}`
  }

  transferUrl(value: string): URL {
    const url = new URL(value, this.baseUrl)
    if (url.origin !== this.baseUrl || url.username || url.password || url.hash) {
      throw clientError(
        "unsupported_contract",
        "The transfer URL must belong to the authenticated Copacker origin.",
        409
      )
    }
    return url
  }

  async transfer(value: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set("Authorization", await this.authorization())
    const signal = init.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 30000)
    try {
      const response = await (this.options.fetch ?? fetch)(this.transferUrl(value), {
        ...init,
        headers,
        signal,
        redirect: "manual"
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw clientError(
          response.status === 401 ? "unauthenticated" : "transfer_failed",
          "The protected transfer failed.",
          response.status
        )
      }
      return response
    } catch (error) {
      if (error instanceof CopackerError) {
        throw error
      }
      throw clientError("transport_error", "The protected transfer could not complete.", 503)
    }
  }

  private async request(
    name: string,
    input: JsonObject,
    account: boolean,
    retrySafe: boolean,
    options: CallOptions = {}
  ): Promise<SuccessEnvelope> {
    operationName.parse(name)
    if (!account && !this.workspaceId) {
      throw clientError("invalid_input", "Select a workspace with --workspace or COPACKER_WORKSPACE.")
    }
    const body = JSON.stringify({ ...(!account ? { workspaceId: this.workspaceId } : {}), input })
    if (new TextEncoder().encode(body).length > 1048576) {
      throw clientError("invalid_input", "The request exceeds 1 MiB.")
    }
    const headers = new Headers({
      Authorization: await this.authorization(),
      "Content-Type": "application/json",
      Accept: "application/json"
    })
    if (options.idempotencyKey) {
      if (!/^[\x21-\x7e]{1,200}$/.test(options.idempotencyKey)) {
        throw clientError("invalid_input", "Execution keys must contain 1–200 visible ASCII characters.")
      }
      headers.set("Idempotency-Key", options.idempotencyKey)
    }
    const signal = options.signal ?? AbortSignal.timeout(this.options.timeoutMs ?? 30000)
    const attempts = retrySafe ? Math.min(3, Math.max(1, this.options.attempts ?? 3)) : 1
    for (let attempt = 0; attempt < attempts; attempt++) {
      let retryAfter = 250 * 2 ** attempt
      try {
        const response = await (this.options.fetch ?? fetch)(`${this.baseUrl}/api/operations/${name}`, {
          method: "POST",
          headers,
          body,
          signal,
          redirect: "manual"
        })
        const value = await boundedJson(response)
        const failure = errorEnvelopeSchema.safeParse(value)
        if (failure.success) {
          const seconds = Number(response.headers.get("retry-after"))
          if (Number.isFinite(seconds) && seconds > 0) {
            retryAfter = Math.min(30000, seconds * 1000)
          }
          throw new CopackerError(failure.data, response.status)
        }
        if (!response.ok) {
          throw clientError(
            "unsupported_contract",
            "The server returned an unrecognized error response.",
            response.status
          )
        }
        const result = successEnvelopeSchema.safeParse(value)
        if (!result.success) {
          throw clientError("unsupported_contract", "The server response does not match the result envelope.", 409)
        }
        if (!account && result.data.meta.workspaceId !== this.workspaceId) {
          throw clientError("unsupported_contract", "The response belongs to a different workspace.", 409)
        }
        return result.data
      } catch (error) {
        const failure =
          error instanceof CopackerError
            ? error
            : clientError(
                "transport_error",
                "The request could not complete. Repeat the command with its retained execution key.",
                503
              )
        const retryable = failure.envelope.error.retryable && [429, 502, 503].includes(failure.status)
        if (!retryable || attempt + 1 === attempts || signal.aborted) {
          throw failure
        }
        try {
          await (this.options.sleep ?? delay)(retryAfter, signal)
        } catch {
          throw failure
        }
      }
    }
    throw clientError("transport_error", "The request could not complete.", 503)
  }

  async describe(name: string, signal?: AbortSignal): Promise<OperationDescriptor> {
    const cached = this.descriptors.get(name)
    if (cached) {
      return cached
    }
    const response = await this.request(
      "schema.show",
      { operation: name },
      name === "account.show" || name === "workspace.list",
      true,
      { signal }
    )
    const parsed = operationDescriptorSchema.safeParse(response.data)
    if (!parsed.success || parsed.data.operation !== name) {
      throw clientError("unsupported_contract", `The server has no compatible schema for ${name}.`, 409)
    }
    if (parsed.data.contractVersion !== contractVersion) {
      throw clientError(
        "unsupported_contract",
        "The CLI and server contract versions differ. Update the CLI before continuing.",
        409
      )
    }
    this.descriptors.set(name, parsed.data)
    return parsed.data
  }

  async call(name: string, input: JsonObject, options: CallOptions = {}): Promise<SuccessEnvelope> {
    const descriptor = options.descriptor ?? (await this.describe(name, options.signal))
    if (descriptor.operation !== name || descriptor.contractVersion !== contractVersion) {
      throw clientError("unsupported_contract", "The operation descriptor does not match the request.", 409)
    }
    let schema: z.ZodType
    try {
      schema = z.fromJSONSchema(descriptor.inputSchema)
    } catch {
      throw clientError("unsupported_contract", "This input schema requires a newer client.", 409)
    }
    const validated = schema.safeParse(input)
    if (!validated.success) {
      const error = clientError(
        "invalid_input",
        "Input does not match the operation schema. Use schema show to inspect required fields."
      )
      error.envelope.error.issues = validated.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
        message: issue.message
      }))
      throw error
    }
    const query = isQuery(descriptor, input)
    if (!query && !options.idempotencyKey) {
      throw clientError("invalid_input", "Mutations require an execution key.")
    }
    const result = await this.request(
      name,
      jsonObject.parse(validated.data),
      descriptor.context === "account",
      query || descriptor.execution.idempotent,
      options
    )
    let output: z.ZodType
    try {
      output = z.fromJSONSchema(descriptor.outputSchema)
    } catch {
      throw clientError("unsupported_contract", "This result schema requires a newer client.", 409)
    }
    const validatedOutput = output.safeParse(result.data)
    if (!validatedOutput.success) {
      throw clientError("unsupported_contract", "The result did not match the published operation schema.", 409)
    }
    return { ...result, data: z.json().parse(validatedOutput.data) }
  }

  async all(name: string, input: JsonObject, options: CallOptions = {}): Promise<SuccessEnvelope> {
    const descriptor = options.descriptor ?? (await this.describe(name, options.signal))
    if (!isQuery(descriptor, input)) {
      throw clientError("invalid_input", "--all is available only for paged reads.")
    }
    let result = await this.call(name, input, { ...options, descriptor })
    const first = pageSchema.safeParse(result.data)
    if (!first.success) {
      throw clientError("unsupported_contract", "This operation did not return a page.", 409)
    }
    const items = [...first.data.items]
    const visited = new Set<string>()
    const snapshotId = first.data.page.snapshotId
    const consistency = first.data.page.consistency
    let page = first.data.page
    while (page.hasMore && page.nextCursor !== null) {
      if (visited.has(page.nextCursor)) {
        throw clientError("cursor_invalidated", "The server repeated a pagination cursor.", 409)
      }
      visited.add(page.nextCursor)
      if (visited.size > 10000) {
        throw clientError("invalid_input", "Pagination exceeded 10,000 pages. Use an entity export.")
      }
      const next = await this.call(name, { ...input, cursor: page.nextCursor }, { ...options, descriptor })
      const parsed = pageSchema.safeParse(next.data)
      if (
        !parsed.success ||
        parsed.data.page.consistency !== consistency ||
        parsed.data.page.snapshotId !== snapshotId
      ) {
        throw clientError("cursor_invalidated", "The collection snapshot changed during traversal.", 409)
      }
      items.push(...parsed.data.items)
      page = parsed.data.page
      const ranks = { complete: 0, partial: 1, unavailable: 2 }
      result = {
        data: next.data,
        meta: {
          ...next.meta,
          completeness:
            ranks[next.meta.completeness] > ranks[result.meta.completeness]
              ? next.meta.completeness
              : result.meta.completeness,
          warnings: [...result.meta.warnings, ...next.meta.warnings],
          redactedFields: [...new Set([...result.meta.redactedFields, ...next.meta.redactedFields])],
          sources: [
            ...new Map([...result.meta.sources, ...next.meta.sources].map((s) => [JSON.stringify(s), s])).values()
          ]
        }
      }
    }
    return { ...result, data: { items, page } }
  }

  async wait(initial: SuccessEnvelope, timeoutMs: number, signal?: AbortSignal): Promise<SuccessEnvelope> {
    const deadline = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([deadline, signal]) : deadline
    let result = initial
    while (true) {
      const parsed = asyncResultSchema.safeParse(result.data)
      if (!parsed.success) {
        return result
      }
      const { operation, statusQuery } = parsed.data
      if (operation.status === "succeeded") {
        return result
      }
      if (!["queued", "running"].includes(operation.status)) {
        const failure = operation.error
        throw new CopackerError(
          {
            error: {
              code: operation.status === "partially_succeeded" ? "partial_write" : (failure?.code ?? "invalid_state"),
              message: failure?.message ?? `Operation ${operation.status}.`,
              retryable: false,
              issues: failure?.issues ?? [],
              recovery: operation.recovery,
              details: { result: result.data }
            },
            meta: result.meta
          },
          409
        )
      }
      try {
        await (this.options.sleep ?? delay)(1000, combined)
        const descriptor = await this.describe(statusQuery.operation, combined)
        if (!isQuery(descriptor, statusQuery.input)) {
          throw clientError("unsupported_contract", "The status selector is not a read operation.", 409)
        }
        result = await this.call(statusQuery.operation, statusQuery.input, { descriptor, signal: combined })
      } catch (error) {
        if (!combined.aborted) {
          throw error
        }
        throw clientError("wait_timeout", "Waiting ended; server work has not been cancelled.", 408, {
          operationId: operation.id,
          statusQuery,
          result: result.data
        })
      }
    }
  }
}
