import { randomBytes } from "node:crypto"
import { z } from "zod"
import { langfuseConfig } from "./integration-config"
import { providerRequest } from "./provider-request"

export type ImportObservation = {
  type: "generation" | "tool"
  name: string
  startedAt: number
  endedAt: number
  outcome: "success" | "failed"
}

export async function observeImportOperation<T>(
  type: ImportObservation["type"],
  name: string,
  operation: () => Promise<T>,
  record?: (observation: ImportObservation) => void
) {
  const startedAt = Date.now()
  let outcome: ImportObservation["outcome"] = "failed"
  try {
    const result = await operation()
    outcome = "success"
    return result
  } finally {
    try {
      record?.({ type, name, startedAt, endedAt: Date.now(), outcome })
    } catch {
      // A telemetry callback must not change the operation's result or error.
    }
  }
}

type ImportTrace = {
  importId: string
  revision: number
  startedAt: number
  outcome: "review" | "failed"
  promptVersion?: number
  model?: string
  tokens?: number
  calls?: number
  costUsd?: number
  observations?: ImportObservation[]
}

// Allowlisted operational metadata only: never send source text, catalog rows or error messages.
export async function traceImport(attempt: ImportTrace, transport: typeof fetch = fetch) {
  // Langfuse is configured only with an HTTPS address, so its keys never go over plain HTTP.
  const langfuse = langfuseConfig()
  if (!langfuse) {
    return false
  }
  try {
    const fields: Record<string, string | number> = {
      "langfuse.trace.name": "purchase-order-import",
      "langfuse.observation.type": "span",
      "langfuse.trace.metadata.importId": attempt.importId,
      "langfuse.trace.metadata.revision": attempt.revision,
      "langfuse.trace.metadata.outcome": attempt.outcome
    }
    if (attempt.promptVersion !== undefined) {
      fields["langfuse.trace.metadata.promptVersion"] = attempt.promptVersion
    }
    if (attempt.model !== undefined) {
      fields["langfuse.trace.metadata.model"] = attempt.model
    }
    if (attempt.tokens !== undefined) {
      fields["langfuse.trace.metadata.totalTokens"] = attempt.tokens
    }
    if (attempt.calls !== undefined) {
      fields["langfuse.trace.metadata.toolCalls"] = attempt.calls
    }
    if (attempt.costUsd !== undefined) {
      fields["langfuse.trace.metadata.reportedCostUsd"] = attempt.costUsd
    }
    const traceId = randomBytes(16).toString("hex")
    const rootSpanId = randomBytes(8).toString("hex")
    const allowedTools = new Set([
      "search_shopify_products",
      "get_shopify_variants",
      "search_amazon_listings",
      "finish_import"
    ])
    const children = (attempt.observations ?? []).slice(0, 42).map((observation) => {
      let name = "unavailable-tool"
      if (observation.type === "generation") {
        name = "import-model-request"
      } else if (allowedTools.has(observation.name)) {
        name = observation.name
      }
      return {
        traceId,
        spanId: randomBytes(8).toString("hex"),
        parentSpanId: rootSpanId,
        name,
        kind: 1,
        startTimeUnixNano: `${BigInt(observation.startedAt) * 1000000n}`,
        endTimeUnixNano: `${BigInt(observation.endedAt) * 1000000n}`,
        attributes: [{ key: "langfuse.observation.type", value: { stringValue: observation.type } }],
        status: { code: observation.outcome === "failed" ? 2 : 1 }
      }
    })
    const result = await providerRequest(
      "Langfuse",
      `${langfuse.origin}/api/public/otel/v1/traces`,
      {
        method: "POST",
        headers: {
          Authorization: langfuse.authorization,
          "content-type": "application/json",
          "x-langfuse-ingestion-version": "4"
        },
        timeoutMs: 5000,
        transport,
        body: JSON.stringify({
          resourceSpans: [
            {
              resource: { attributes: [{ key: "service.name", value: { stringValue: "copacker" } }] },
              scopeSpans: [
                {
                  scope: { name: "copacker.import" },
                  spans: [
                    {
                      traceId,
                      spanId: rootSpanId,
                      name: "purchase-order-import",
                      kind: 1,
                      startTimeUnixNano: `${BigInt(attempt.startedAt) * 1000000n}`,
                      endTimeUnixNano: `${BigInt(Date.now()) * 1000000n}`,
                      attributes: Object.entries(fields).map(([key, value]) => {
                        if (typeof value === "string") {
                          return { key, value: { stringValue: value } }
                        }
                        return {
                          key,
                          value: Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
                        }
                      }),
                      status: { code: attempt.outcome === "failed" ? 2 : 1 }
                    },
                    ...children
                  ]
                }
              ]
            }
          ]
        })
      },
      z.unknown()
    )
    // OTLP answers a partly rejected export with success and a count of the rejected spans.
    const partial = z.object({ partialSuccess: z.object({ rejectedSpans: z.coerce.number() }) }).safeParse(result)
    return !(partial.success && partial.data.partialSuccess.rejectedSpans > 0)
  } catch {
    // Observability outages must never retry the import or replace its actual result.
    return false
  }
}
