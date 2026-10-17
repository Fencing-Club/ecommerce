import { z } from "zod"
import { cloudflareJson } from "./preview-cloudflare"
import { reconcileResourceTags, tagTarget } from "./resource-tags"

const accountId = z
  .string()
  .regex(/^[a-f0-9]{32}$/)
  .parse(process.env.CLOUDFLARE_ACCOUNT_ID)
const targets = z
  .array(tagTarget)
  .min(1)
  .parse(JSON.parse(process.env.COPACKER_TAG_TARGETS || "[]"))
for (const target of targets) {
  reconcileResourceTags(target, (args, body) => cloudflareJson({ accountId }, args, body))
}
process.stdout.write(`Verified tags on ${targets.length} resources\n`)
