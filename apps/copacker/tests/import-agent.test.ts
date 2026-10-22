import { afterEach, describe, expect, it, vi } from "vitest"
import { runImportAgent, type ImportUsage } from "../src/server/import-agent"
import { validateProposal } from "../src/server/import-proposal"
import type { ImportObservation } from "../src/server/import-trace"
const id = "gid://shopify/ProductVariant/1"
const proposal = () => ({
  reference: "PO36",
  currency: "USD",
  items: [
    {
      description: "Body cord",
      sourceSku: "supplier-1",
      sourcePage: 1,
      sourceQuantity: 160,
      sourceUnit: "pieces",
      sourceUnitPrice: "4.08",
      sourceLineTotal: "652.80",
      selectedVariantId: id,
      candidateVariantIds: [id],
      pieces: 160,
      piecesPerSet: 2,
      pricePerPiece: "4.08",
      reason: "Exact supplier SKU",
      warnings: []
    }
  ],
  adjustments: [{ description: "Packing", amount: "12.80", sourcePage: 1 }],
  documentTotal: "665.60",
  warnings: []
})
const toolResponse = (name: string, args: unknown) =>
  Response.json({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: "call-1", type: "function", function: { name, arguments: JSON.stringify(args) } }]
        }
      }
    ],
    usage: { total_tokens: 100 }
  })
afterEach(() => vi.unstubAllEnvs())
describe("import proposals", () => {
  it("keeps source prices and charges and rejects invented product IDs", () => {
    expect(validateProposal(proposal(), new Set([id])).adjustments[0]?.amount).toBe("12.80")
    expect(() => validateProposal(proposal(), new Set())).toThrow("unverified")
  })
  it("keeps separate packing, freight, tax and negative discounts in the proposal", () => {
    const result = validateProposal(
      {
        ...proposal(),
        adjustments: [
          { description: "Packing, 1560 packs at 0.16", amount: "249.60", sourcePage: 2 },
          { description: "Freight", amount: "80.00", sourcePage: 2 },
          { description: "Tax", amount: "6.40", sourcePage: 2 },
          { description: "Discount", amount: "-20.00", sourcePage: 2 }
        ],
        notes: ["Totals match."],
        warnings: []
      },
      new Set([id])
    )
    expect(result.adjustments.map((charge) => charge.amount)).toEqual(["249.60", "80.00", "6.40", "-20.00"])
    expect(result.notes).toEqual(["Totals match."])
    expect(result.warnings).toEqual([])
    expect(result.items).toHaveLength(1)
  })
  it("allows a reviewer-added line without inventing its source page or product identity", () => {
    const p = proposal()
    const manual = { ...p.items[0]!, sourcePage: null, selectedVariantId: null, candidateVariantIds: [] }
    const result = validateProposal({ ...p, items: [manual] }, new Set())
    expect(result.items[0]?.sourcePage).toBeNull()
    expect(result.items[0]?.selectedVariantId).toBeNull()
    expect(() => validateProposal({ ...p, items: [{ ...manual, sourcePage: 0 }] }, new Set())).toThrow("sourcePage")
  })
  it("flags incomplete packs for human correction", () => {
    const p = proposal()
    p.items[0]!.pieces = 159
    expect(validateProposal(p, new Set([id])).items[0]?.warnings).toHaveLength(1)
  })
  it("runs only supplied read tools and returns a validated proposal", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test")
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(toolResponse("search", { query: "cord" }))
      .mockResolvedValueOnce(toolResponse("finish_import", proposal()))
    const known = new Set<string>(),
      execute = vi.fn<() => Promise<Array<{ id: string }>>>(async () => {
        known.add(id)
        return [{ id }]
      })
    const onObservation = vi.fn<(observation: ImportObservation) => void>()
    const result = await runImportAgent(
      {
        pdf: new Uint8Array([1]),
        prompt: "test",
        tools: [{ name: "search", description: "search", parameters: {}, execute }],
        knownVariants: known,
        assertActive: async () => Promise.resolve(),
        onObservation
      },
      transport
    )
    expect(result.proposal.items).toHaveLength(1)
    expect(execute).toHaveBeenCalledWith({ query: "cord" })
    expect(result.tokens).toBe(200)
    expect(onObservation.mock.calls.map(([observation]) => observation.type)).toEqual([
      "generation",
      "tool",
      "generation"
    ])
    expect(JSON.stringify(onObservation.mock.calls)).not.toContain("cord")
  })
  it("rejects a model request for a write tool", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test")
    const transport = vi.fn<typeof fetch>().mockResolvedValue(toolResponse("create_shipment", {}))
    await expect(
      runImportAgent(
        {
          pdf: new Uint8Array(),
          prompt: "test",
          tools: [],
          knownVariants: new Set(),
          assertActive: async () => Promise.resolve()
        },
        transport
      )
    ).rejects.toThrow("unavailable tool")
  })
  it("checks cancellation before sending documents", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test")
    const transport = vi.fn<typeof fetch>()
    await expect(
      runImportAgent(
        {
          pdf: new Uint8Array(),
          prompt: "test",
          tools: [],
          knownVariants: new Set(),
          assertActive: async () => {
            throw new Error("cancelled")
          }
        },
        transport
      )
    ).rejects.toThrow("cancelled")
    expect(transport).not.toHaveBeenCalled()
  })
})

describe("provider failures and bounds", () => {
  function input(signal?: AbortSignal) {
    vi.stubEnv("OPENROUTER_API_KEY", "test")
    return {
      pdf: new Uint8Array([1]),
      prompt: "test",
      tools: [],
      knownVariants: new Set([id]),
      assertActive: async () => Promise.resolve(),
      signal
    }
  }
  it("accumulates provider costs across calls and preserves reported usage before a later failure", async () => {
    const first = await toolResponse("search", {}).json()
    first.usage.cost = 0.012
    const second = await toolResponse("finish_import", proposal()).json()
    second.usage.cost = 0.023
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(Response.json(second))
    const onUsage = vi.fn<(usage: ImportUsage) => void>()
    const request = {
      ...input(),
      tools: [{ name: "search", description: "Search", parameters: {}, execute: async () => [] }],
      onUsage
    }
    const result = await runImportAgent(request, transport)
    expect(result.costUsd).toBeCloseTo(0.035)
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ tokens: 200, calls: 2, costUsd: 0.035 }))

    const failed = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(first))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    onUsage.mockClear()
    await expect(runImportAgent(request, failed)).rejects.toThrow("503")
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ tokens: 100, calls: 1, costUsd: 0.012 }))
  })
  it("does not treat missing provider cost as zero", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(toolResponse("finish_import", proposal()))
    const result = await runImportAgent(input(), transport)
    expect(result.costUsd).toBeUndefined()
  })
  it("preserves charged usage for a truncated completion", async () => {
    const body = await toolResponse("finish_import", proposal()).json()
    body.choices[0].finish_reason = "length"
    body.usage.cost = 0.007
    const onUsage = vi.fn<(usage: ImportUsage) => void>()
    await expect(
      runImportAgent({ ...input(), onUsage }, vi.fn<typeof fetch>().mockResolvedValue(Response.json(body)))
    ).rejects.toThrow("incomplete")
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ tokens: 100, calls: 0, costUsd: 0.007 }))
  })
  it("does not transmit a document when its abort signal is already cancelled", async () => {
    const transport = vi.fn<typeof fetch>()
    await expect(runImportAgent(input(AbortSignal.abort(new Error("Cancelled"))), transport)).rejects.toThrow(
      "Cancelled"
    )
    expect(transport).not.toHaveBeenCalled()
  })
  it("uses supported automatic tool selection but never accepts unstructured completion text", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, request) => {
      expect(JSON.parse(String(request?.body))).toMatchObject({ tool_choice: "auto" })
      return Response.json({
        choices: [{ message: { content: "The purchase order is ready." }, finish_reason: "stop" }]
      })
    })
    await expect(runImportAgent(input(), transport)).rejects.toThrow("did not return an import proposal")
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it("rejects a late successful response after cancellation", async () => {
    const controller = new AbortController()
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(new Error("Cancelled"))
      return toolResponse("finish_import", proposal())
    })
    await expect(runImportAgent(input(controller.signal), transport)).rejects.toThrow("Cancelled")
  })
  it.each([402, 429, 500])("reports provider status %i without exposing its body", async (status) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider diagnostics", { status }))
    await expect(runImportAgent(input(), transport)).rejects.toThrow(`OpenRouter request failed (${status})`)
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it.each(["length", "content_filter"])(
    "rejects %s responses even when tool JSON looks valid",
    async (finish_reason) => {
      const body = await toolResponse("finish_import", proposal()).json()
      body.choices[0].finish_reason = finish_reason
      const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
      await expect(runImportAgent(input(), transport)).rejects.toThrow("incomplete import response")
    }
  )
  it("stops before accepting a proposal over the token budget", async () => {
    const body = await toolResponse("finish_import", proposal()).json()
    body.usage.total_tokens = 600001
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body))
    await expect(runImportAgent(input(), transport)).rejects.toThrow("token budget")
  })
  it("accepts a complete 113-line proposal after batched catalog matching exceeds the old budget", async () => {
    const large = proposal()
    large.items = Array.from({ length: 113 }, () => ({ ...large.items[0]! }))
    const body = await toolResponse("finish_import", large).json()
    body.usage.total_tokens = 180000
    const transport = vi.fn<typeof fetch>().mockImplementation(async (_url, request) => {
      expect(JSON.parse(String(request?.body)).max_tokens).toBe(32000)
      return Response.json(body)
    })
    expect((await runImportAgent(input(), transport)).proposal.items).toHaveLength(113)
  })
  it("bounds repeated lookups even if the model never finishes", async () => {
    const execute = vi.fn<() => Promise<unknown>>().mockResolvedValue([])
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => toolResponse("search", {}))
    await expect(
      runImportAgent(
        { ...input(), tools: [{ name: "search", description: "search", parameters: {}, execute }] },
        transport
      )
    ).rejects.toThrow("step limit")
    expect(transport).toHaveBeenCalledTimes(12)
  })
  it("rejects oversized tool output before sending it to the provider", async () => {
    const execute = vi.fn<() => Promise<unknown>>().mockResolvedValue("x".repeat(150001))
    const transport = vi.fn<typeof fetch>().mockResolvedValue(toolResponse("search", {}))
    await expect(
      runImportAgent(
        { ...input(), tools: [{ name: "search", description: "search", parameters: {}, execute }] },
        transport
      )
    ).rejects.toThrow("result exceeds")
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
