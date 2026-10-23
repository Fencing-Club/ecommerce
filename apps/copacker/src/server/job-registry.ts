import { amazonAdsJob } from "./amazon-ads"
import { amazonEventJob, amazonSubscribeJob } from "./amazon-notifications"
import { analyticsJob } from "./analytics-jobs"
import { ebayEventJob, ebaySubscribeJob } from "./ebay-events"
import { evidenceRecoveryJob } from "./evidence-recovery"
import { importJob } from "./import-job"
import { amazonShipmentFailed, amazonShipmentJob } from "./job-amazon-shipment"
import { emailJob } from "./job-email"
import { jobPayloads, type JobKind } from "./job-payloads"
import { defineJob, type JobDefinition } from "./job-runtime"
import { shopifyCostJob } from "./job-shopify-cost"
import { labelsJob } from "./label-release"
import { reconcileJob } from "./reconcile"
import { salesJob } from "./sales-orders"
import { shopifyComplianceJob } from "./shopify-compliance"
import { shopifyEventJob, shopifySubscribeJob } from "./shopify-webhooks"
import { stockJob } from "./stock"

type JobRegistry = { [K in JobKind]: JobDefinition<K> }

// Every kind of job: where it runs, what it carries and what runs it. Queue handlers finish within one queue delivery;
// Workflow handlers can run for hours.
const jobDefinitions = {
  amazon: defineJob({
    kind: "amazon",
    executor: "workflow",
    payload: jobPayloads.amazon,
    run: amazonShipmentJob,
    onFailure: amazonShipmentFailed
  }),
  email: defineJob({ kind: "email", executor: "workflow", payload: jobPayloads.email, run: emailJob }),
  shopify: defineJob({ kind: "shopify", executor: "workflow", payload: jobPayloads.shopify, run: shopifyCostJob }),
  import: defineJob({ kind: "import", executor: "workflow", payload: jobPayloads.import, run: importJob }),
  stock: defineJob({ kind: "stock", executor: "workflow", payload: jobPayloads.stock, run: stockJob }),
  sales: defineJob({ kind: "sales", executor: "workflow", payload: jobPayloads.sales, run: salesJob }),
  analytics: defineJob({ kind: "analytics", executor: "queue", payload: jobPayloads.analytics, run: analyticsJob }),
  "evidence-recovery": defineJob({
    kind: "evidence-recovery",
    executor: "workflow",
    payload: jobPayloads["evidence-recovery"],
    run: evidenceRecoveryJob
  }),
  "shopify-event": defineJob({
    kind: "shopify-event",
    executor: "queue",
    payload: jobPayloads["shopify-event"],
    run: shopifyEventJob
  }),
  "shopify-subscribe": defineJob({
    kind: "shopify-subscribe",
    executor: "workflow",
    payload: jobPayloads["shopify-subscribe"],
    run: shopifySubscribeJob
  }),
  "shopify-compliance": defineJob({
    kind: "shopify-compliance",
    executor: "workflow",
    payload: jobPayloads["shopify-compliance"],
    run: shopifyComplianceJob
  }),
  "amazon-event": defineJob({
    kind: "amazon-event",
    executor: "workflow",
    payload: jobPayloads["amazon-event"],
    run: amazonEventJob
  }),
  "amazon-subscribe": defineJob({
    kind: "amazon-subscribe",
    executor: "workflow",
    payload: jobPayloads["amazon-subscribe"],
    run: amazonSubscribeJob
  }),
  "amazon-ads": defineJob({
    kind: "amazon-ads",
    executor: "workflow",
    payload: jobPayloads["amazon-ads"],
    run: amazonAdsJob
  }),
  "ebay-event": defineJob({
    kind: "ebay-event",
    executor: "queue",
    payload: jobPayloads["ebay-event"],
    run: ebayEventJob
  }),
  "ebay-subscribe": defineJob({
    kind: "ebay-subscribe",
    executor: "workflow",
    payload: jobPayloads["ebay-subscribe"],
    run: ebaySubscribeJob
  }),
  reconcile: defineJob({ kind: "reconcile", executor: "workflow", payload: jobPayloads.reconcile, run: reconcileJob }),
  labels: defineJob({ kind: "labels", executor: "queue", payload: jobPayloads.labels, run: labelsJob })
} satisfies JobRegistry

function isJobKind(kind: string): kind is JobKind {
  return Object.hasOwn(jobDefinitions, kind)
}

// What runs a stored job, or undefined for a kind nothing runs.
export function jobDefinition(kind: string): JobDefinition<JobKind> | undefined {
  return isJobKind(kind) ? jobDefinitions[kind] : undefined
}
