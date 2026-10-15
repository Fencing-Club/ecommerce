import { z } from "zod"
import { importProposalSchema, validateProposal } from "./import-proposal"
import { observeImportOperation, type ImportObservation } from "./import-trace"

const callSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() })
})
const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional(), tool_calls: z.array(callSchema).optional() }),
        finish_reason: z.string().nullable().optional()
      })
    )
    .min(1),
  usage: z
    .object({ total_tokens: z.number().int().nonnegative(), cost: z.number().nonnegative().optional() })
    .optional()
})
export type ImportUsage = { model: string; tokens: number; calls: number; costUsd?: number }
export type ImportTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: unknown) => Promise<unknown>
}

export async function runImportAgent(
  input: {
    pdf: Uint8Array
    prompt: string
    tools: ImportTool[]
    knownVariants: Set<string>
    assertActive: () => Promise<void>
    signal?: AbortSignal
    onUsage?: (usage: ImportUsage) => void
    onObservation?: (observation: ImportObservation) => void
  },
  transport: typeof fetch = fetch
) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OpenRouter is not configured")
  }
  const messages: Record<string, unknown>[] = [
    { role: "system", content: input.prompt },
    {
      role: "user",
      content: [
        { type: "text", text: "Prepare a review-only purchase order proposal from this document." },
        {
          type: "file",
          file: {
            filename: "purchase-order.pdf",
            file_data: `data:application/pdf;base64,${Buffer.from(input.pdf).toString("base64")}`
          }
        }
      ]
    }
  ]
  const tools = [
    ...input.tools.map(({ name, description, parameters }) => ({
      type: "function",
      function: { name, description, parameters }
    })),
    {
      type: "function",
      function: {
        name: "finish_import",
        description: "Return the complete review proposal with every document product line.",
        parameters: z.toJSONSchema(importProposalSchema)
      }
    }
  ]
  let tokens = 0,
    calls = 0,
    costUsd = 0,
    hasCompleteCost = true
  const usage = (): ImportUsage => ({
    model: "anthropic/claude-opus-5.5",
    tokens,
    calls,
    ...(hasCompleteCost ? { costUsd } : {})
  })
  const deadline = AbortSignal.timeout(8 * 60 * 1000)
  const signal = AbortSignal.any([deadline, ...(input.signal ? [input.signal] : [])])
  const assertActive = async () => {
    signal.throwIfAborted()
    await input.assertActive()
    signal.throwIfAborted()
  }
  for (let step = 0; step < 12; step++) {
    await assertActive()
    const result = await observeImportOperation(
      "generation",
      "import-model-request",
      async () => {
        const response = await transport("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "anthropic/claude-opus-5.5",
            messages,
            tools,
            tool_choice: "auto",
            parallel_tool_calls: false,
            // The supported 150-line proposal can exceed 12k output tokens even without catalog lookups.
            max_tokens: 32000,
            plugins: [{ id: "file-parser", pdf: { engine: "native" } }]
          }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
        })
        if (!response.ok) {
          throw new Error(`OpenRouter request failed (${response.status})`)
        }
        return responseSchema.parse(await response.json())
      },
      input.onObservation
    )
    tokens += result.usage?.total_tokens ?? 0
    if (result.usage?.cost === undefined) {
      hasCompleteCost = false
    } else {
      costUsd += result.usage.cost
    }
    input.onUsage?.(usage())
    await assertActive()
    if (["length", "content_filter"].includes(result.choices[0]!.finish_reason ?? "")) {
      throw new Error("The provider returned an incomplete import response")
    }
    if (tokens > 600000) {
      throw new Error("Import token budget reached; use a smaller document")
    }
    const message = result.choices[0]!.message
    const requested = message.tool_calls ?? []
    if (!requested.length) {
      throw new Error("The model did not return an import proposal or catalog lookup")
    }
    messages.push({ role: "assistant", ...message })
    for (const call of requested) {
      await assertActive()
      calls++
      input.onUsage?.(usage())
      if (calls > 30) {
        throw new Error("Import catalog lookup limit reached")
      }
      const args: unknown = JSON.parse(call.function.arguments)
      if (call.function.name === "finish_import") {
        if (requested.length !== 1) {
          throw new Error("Import completion must be separate from catalog lookups")
        }
        return {
          proposal: validateProposal(args, input.knownVariants),
          ...usage()
        }
      }
      const tool = input.tools.find((t) => t.name === call.function.name)
      if (!tool) {
        throw new Error("The model requested an unavailable tool")
      }
      const output = await observeImportOperation(
        "tool",
        tool.name,
        async () => {
          const value = JSON.stringify(await tool.execute(args))
          if (value.length > 150000) {
            throw new Error("Catalog result exceeds import limits")
          }
          return value
        },
        input.onObservation
      )
      await assertActive()
      messages.push({ role: "tool", tool_call_id: call.id, content: output })
    }
  }
  throw new Error("Import step limit reached; review a smaller document")
}
