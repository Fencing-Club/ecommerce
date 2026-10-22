import { variantIdSchema } from "@repo/copacker-marketplaces/shopify"
import type { CatalogVariant } from "@repo/copacker-marketplaces/shopify"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index"
import { poImports } from "../db/schema"
import { catalogMatches } from "./catalog-matches"
import { shopifyFor, amazonFor } from "./connections"
import type { ImportTool } from "./import-agent"
import type { ImportUsage } from "./import-agent"
import { runImportAgent } from "./import-agent"
import type { ImportObservation } from "./import-trace"
import { traceImport } from "./import-trace"
import { langfuseConfig } from "./integration-config"
import type { JobInput } from "./job-payloads"
import type { JobContext } from "./job-runtime"
import { logEvent } from "./log"
import { withVariantFields } from "./product-fields"
import { providerRequest } from "./provider-request"
import { getFile } from "./storage"

// Worker job: reads an uploaded purchase order with the import model, matching its lines to the buyer's catalog, and
// leaves a proposal for the buyer to review.
export async function importJob(
  { id, revision }: JobInput<"import">,
  { assertOwned }: Pick<JobContext, "assertOwned">
) {
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
    // Langfuse is configured only with an HTTPS address, so its keys never go over plain HTTP.
    const langfuse = langfuseConfig()
    if (!langfuse) {
      throw new Error("Langfuse is not configured")
    }
    const version = record.promptVersion ? `version=${record.promptVersion}` : "label=production"
    const prompt = await providerRequest(
      "Langfuse",
      `${langfuse.origin}/api/public/v2/prompts/purchase-order-import?${version}`,
      { headers: { Authorization: langfuse.authorization }, timeoutMs: 15000 },
      z.object({ prompt: z.string(), version: z.number().int().positive() })
    )
    promptVersion = prompt.version
    await assertActive()
    await db().update(poImports).set({ promptVersion: prompt.version }).where(active)
    const shop = await shopifyFor(record.orgId, record.shopifyDomain)
    const knownVariants = new Set<string>()
    const catalog = new Map<string, CatalogVariant>()
    let cursor: string | null = null,
      complete = false,
      pages = 0
    const searchArgs = z.object({ queries: z.array(z.string().trim().min(1).max(255)).min(1).max(50) }).strict()
    const variantsArgs = z
      .object({
        ids: z.array(variantIdSchema).min(1).max(20)
      })
      .strict()
    const amazonArgs = z.object({ skus: z.array(z.string().min(1).max(255)).min(1).max(20) }).strict()
    const tools: ImportTool[] = [
      {
        name: "search_shopify_products",
        description:
          "Search up to 50 buyer SKUs, supplier SKUs or product/variation phrases together. Batch the document's SKUs instead of searching one line per call. Each call advances catalog coverage by up to five pages. Repeat while catalogComplete is false to find further matches. Use get_shopify_variants only for missing bundle or price details.",
        parameters: z.toJSONSchema(searchArgs),
        execute: async (raw) => {
          const { queries } = searchArgs.parse(raw)
          for (let i = 0; i < 5 && !complete; i++) {
            await assertActive()
            if (pages >= 100) {
              throw new Error("Catalog exceeds import search limit")
            }
            const page = await shop.catalogPage(cursor)
            pages++
            for (const item of await withVariantFields(record.orgId, shop.domain, page.nodes)) {
              if (item) {
                catalog.set(item.id, item)
              }
            }
            complete = !page.pageInfo.hasNextPage
            if (!complete && (!page.pageInfo.endCursor || page.pageInfo.endCursor === cursor)) {
              throw new Error("Catalog pagination did not advance")
            }
            cursor = page.pageInfo.endCursor
          }
          const searches = queries.map((query) => {
            const matches = catalogMatches(catalog.values(), query)
            const results = matches.slice(0, 10).map((variant) => {
              knownVariants.add(variant.id)
              // Search needs identity, not every inventory and bundle field repeated in every model turn.
              return {
                id: variant.id,
                sku: variant.sku,
                supplierSku: variant.supplierSku?.value ?? null,
                product: variant.product.title,
                variant: variant.title,
                requiresComponents: variant.requiresComponents
              }
            })
            return { query, results, matchesTruncated: matches.length > 10 }
          })
          return { searches, catalogComplete: complete, scanned: catalog.size }
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
          return withVariantFields(record.orgId, shop.domain, await shop.variants(ids))
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
      logEvent("warn", "import_trace_unavailable", { importId: id, revision })
    }
  }
}
