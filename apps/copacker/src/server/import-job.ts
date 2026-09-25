import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index"
import { poImports } from "../db/schema"
import { catalogMatches } from "./catalog-matches"
import { shopifyFor, amazonFor } from "./connections"
import { runImportAgent, type ImportTool, type ImportUsage } from "./import-agent"
import { traceImport, type ImportObservation } from "./import-trace"
import { getFile } from "./storage"

export async function importJob(payload: Record<string, unknown>, assertOwned: () => Promise<void>) {
  const { id, revision } = z.object({ id: z.uuid(), revision: z.number().int().positive() }).parse(payload)
  const [record] = await db()
    .select()
    .from(poImports)
    .where(and(eq(poImports.id, id), eq(poImports.revision, revision)))
  if (!record || !["queued", "running"].includes(record.status)) {
    return
  }
  const startedAt = Date.now()
  let promptVersion = record.promptVersion ?? undefined
  let outcome: "review" | "failed" = "failed"
  let usage: ImportUsage | undefined
  const observations: ImportObservation[] = []
  const active = and(
    eq(poImports.id, id),
    eq(poImports.revision, revision),
    inArray(poImports.status, ["queued", "running"])
  )
  const assertActive = async () => {
    await assertOwned()
    const [current] = await db().select({ id: poImports.id }).from(poImports).where(active)
    if (!current) {
      throw new Error("Import was cancelled or replaced")
    }
  }
  try {
    await assertActive()
    await db().update(poImports).set({ status: "running", error: null }).where(active)
    const { LANGFUSE_BASE_URL, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env
    if (!LANGFUSE_BASE_URL || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
      throw new Error("Langfuse is not configured")
    }
    const base = new URL(LANGFUSE_BASE_URL)
    if (base.protocol !== "https:") {
      throw new Error("Langfuse requires HTTPS")
    }
    const version = record.promptVersion ? `version=${record.promptVersion}` : "label=production"
    const response = await fetch(`${base.origin}/api/public/v2/prompts/purchase-order-import?${version}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64")}`
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok) {
      throw new Error(`Import prompt unavailable (${response.status})`)
    }
    const prompt = z.object({ prompt: z.string(), version: z.number().int().positive() }).parse(await response.json())
    promptVersion = prompt.version
    await assertActive()
    await db().update(poImports).set({ promptVersion: prompt.version }).where(active)
    const shop = await shopifyFor(record.orgId, record.shopifyDomain)
    const knownVariants = new Set<string>()
    const catalog = new Map<string, Awaited<ReturnType<typeof shop.catalogPage>>["nodes"][number]>()
    let cursor: string | null = null,
      complete = false,
      pages = 0
    const searchArgs = z.object({ query: z.string().trim().min(1).max(255) }).strict()
    const variantsArgs = z
      .object({
        ids: z
          .array(z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/))
          .min(1)
          .max(20)
      })
      .strict()
    const amazonArgs = z.object({ skus: z.array(z.string().min(1).max(255)).min(1).max(20) }).strict()
    const tools: ImportTool[] = [
      {
        name: "search_shopify_products",
        description:
          "Search buyer SKU, supplier SKU and product/variation text. Each call advances catalog coverage by up to five pages. Repeat while catalogComplete is false to find further matches.",
        parameters: z.toJSONSchema(searchArgs),
        execute: async (raw) => {
          const { query } = searchArgs.parse(raw)
          for (let i = 0; i < 5 && !complete; i++) {
            await assertActive()
            if (pages >= 100) {
              throw new Error("Catalog exceeds import search limit")
            }
            const page = await shop.catalogPage(cursor)
            pages++
            for (const item of page.nodes) {
              catalog.set(item.id, item)
            }
            complete = !page.pageInfo.hasNextPage
            if (!complete && (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor)) {
              throw new Error("Catalog pagination did not advance")
            }
            cursor = page.pageInfo.endCursor
          }
          const matches = catalogMatches(catalog.values(), query)
          const results = matches.slice(0, 30)
          results.forEach((v) => knownVariants.add(v.id))
          return { results, catalogComplete: complete, matchesTruncated: matches.length > 30, scanned: catalog.size }
        }
      },
      {
        name: "get_shopify_variants",
        description: "Fetch details for previously discovered catalog variants.",
        parameters: z.toJSONSchema(variantsArgs),
        execute: async (raw) => {
          const { ids } = variantsArgs.parse(raw)
          if (ids.some((id) => !knownVariants.has(id))) {
            throw new Error("Discover variants with catalog search first")
          }
          return shop.variants(ids)
        }
      },
      {
        name: "search_amazon_listings",
        description: "Look up the connected US seller's exact SKUs and return ASIN/FNSKU identities.",
        parameters: z.toJSONSchema(amazonArgs),
        execute: async (raw) => {
          const { skus } = amazonArgs.parse(raw)
          if (!record.amazonSellerId) {
            return { unavailable: "Amazon is not connected" }
          }
          const amazon = await amazonFor(record.orgId, record.amazonSellerId)
          return [...(await amazon.listings(record.amazonSellerId, skus))].map(([sku, identity]) => ({
            sku,
            ...identity
          }))
        }
      }
    ]
    const result = await runImportAgent({
      pdf: await getFile(record.objectKey),
      prompt: prompt.prompt,
      tools,
      knownVariants,
      assertActive,
      onObservation: (observation) => observations.push(observation),
      onUsage: (current) => {
        usage = current
      }
    })
    if (!complete) {
      result.proposal.warnings.push("Catalog search was incomplete. Review matches before saving.")
    }
    await assertActive()
    await db()
      .update(poImports)
      .set({
        status: "review",
        proposal: result.proposal,
        model: result.model,
        tokens: result.tokens,
        updatedAt: new Date()
      })
      .where(active)
    outcome = "review"
  } catch (error) {
    await assertOwned()
    await db()
      .update(poImports)
      .set({ status: "failed", error: error instanceof Error ? error.message : "Import failed", updatedAt: new Date() })
      .where(active)
    throw error
  } finally {
    const recorded = await traceImport({
      importId: id,
      revision,
      startedAt,
      outcome,
      promptVersion,
      observations,
      ...usage
    })
    if (!recorded) {
      console.warn("Import trace delivery unavailable")
    }
  }
}
