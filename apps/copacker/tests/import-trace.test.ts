import { afterEach, expect, it, vi } from "vitest"
import { observeImportOperation, traceImport, type ImportObservation } from "../src/server/import-trace"

afterEach(() => vi.unstubAllEnvs())
function configure() {
  vi.stubEnv("LANGFUSE_BASE_URL", "https://langfuse.example")
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "test-public")
  vi.stubEnv("LANGFUSE_SECRET_KEY", "test-secret")
}
const attempt = {
  importId: "test-import",
  revision: 1,
  startedAt: Date.now(),
  outcome: "review" as const,
  tokens: 123,
  calls: 2
}

it("exports only allowlisted metadata through OTLP", async () => {
  configure()
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}))
  const withPrivateFields = {
    ...attempt,
    source: "private invoice",
    error: "private provider error",
    credentials: "secret",
    costUsd: 0.0123
  }
  expect(await traceImport(withPrivateFields, transport)).toBe(true)
  expect(transport.mock.calls[0]?.[0]).toBe("https://langfuse.example/api/public/otel/v1/traces")
  const body = String(transport.mock.calls[0]?.[1]?.body)
  expect(body).toContain("test-import")
  expect(body).toContain("totalTokens")
  expect(body).toContain('"doubleValue":0.0123')
  expect(body).toContain("reportedCostUsd")
  expect(body).not.toContain("private")
  expect(body).not.toContain("secret")
})
it("does not turn observability outages into failed imports", async () => {
  configure()
  const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("Unavailable"))
  expect(await traceImport(attempt, transport)).toBe(false)
})
it("recognizes partial rejection rather than claiming delivery", async () => {
  configure()
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ partialSuccess: { rejectedSpans: "1" } }))
  expect(await traceImport(attempt, transport)).toBe(false)
})
it("does not send credentials to a non-HTTPS endpoint", async () => {
  configure()
  vi.stubEnv("LANGFUSE_BASE_URL", "http://langfuse.example")
  const transport = vi.fn<typeof fetch>()
  expect(await traceImport(attempt, transport)).toBe(false)
  expect(transport).not.toHaveBeenCalled()
})

it("parents bounded generation and tool observations without exporting arbitrary names or payloads", async () => {
  configure()
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}))
  const observations = [
    {
      type: "generation" as const,
      name: "private model content",
      startedAt: 100,
      endedAt: 200,
      outcome: "success" as const
    },
    {
      type: "tool" as const,
      name: "search_shopify_products",
      startedAt: 200,
      endedAt: 300,
      outcome: "failed" as const
    },
    { type: "tool" as const, name: "private injected name", startedAt: 300, endedAt: 400, outcome: "failed" as const }
  ]
  expect(
    await traceImport({ ...attempt, observations: Array.from({ length: 20 }, () => observations).flat() }, transport)
  ).toBe(true)
  const body = String(transport.mock.calls[0]?.[1]?.body)
  const spans = JSON.parse(body).resourceSpans[0].scopeSpans[0].spans
  expect(spans).toHaveLength(43)
  expect(spans[1]).toMatchObject({
    name: "import-model-request",
    parentSpanId: spans[0].spanId,
    traceId: spans[0].traceId,
    status: { code: 1 }
  })
  expect(spans[2]).toMatchObject({
    name: "search_shopify_products",
    parentSpanId: spans[0].spanId,
    status: { code: 2 }
  })
  expect(spans[3].name).toBe("unavailable-tool")
  expect(body).not.toContain("private")
})

it("records operation failures without replacing the original error when telemetry fails", async () => {
  const failure = new Error("private provider failure")
  const record = vi.fn<(observation: ImportObservation) => void>(() => {
    throw new Error("trace failure")
  })
  await expect(
    observeImportOperation(
      "tool",
      "search_shopify_products",
      async () => {
        throw failure
      },
      record
    )
  ).rejects.toBe(failure)
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ type: "tool", outcome: "failed" }))
  expect(JSON.stringify(record.mock.calls)).not.toContain("private")
  await expect(observeImportOperation("generation", "request", async () => 42, record)).resolves.toBe(42)
})
