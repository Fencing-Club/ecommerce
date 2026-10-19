import { z } from "zod"
import {
  checkPostingTotal,
  formatPostingAmount,
  postingAmount,
  postingEvidence,
  type ReconciliationPosting
} from "./amazon-reconciliation"

const nodes = z.array(z.record(z.string(), z.unknown()))
export function amazonPostingDetail(posting: ReconciliationPosting) {
  const leaves: { path: string[]; amount: string; currency: string }[] = []
  let valid = true
  let visited = 0
  function walk(raw: unknown, total: unknown, path: string[], depth: number) {
    const parsed = nodes.safeParse(raw)
    if (
      !parsed.success ||
      depth > 20 ||
      checkPostingTotal(
        total,
        parsed.data.map((n) => n.breakdownAmount)
      ) !== "balanced"
    ) {
      valid = false
      return
    }
    for (const node of parsed.data) {
      visited += 1
      const money = postingAmount(node.breakdownAmount)
      if (visited > 5000 || !money || typeof node.breakdownType !== "string") {
        valid = false
        return
      }
      const next = [...path, node.breakdownType]
      const children = nodes.safeParse(node.breakdowns)
      if (
        node.breakdowns !== undefined &&
        node.breakdowns !== null &&
        !(children.success && children.data.length === 0)
      ) {
        walk(node.breakdowns, node.breakdownAmount, next, depth + 1)
      } else {
        leaves.push({ path: next, amount: formatPostingAmount(money), currency: money.currency })
      }
    }
  }
  walk(posting.data.breakdowns, posting.data.totalAmount, [], 0)
  return {
    ...postingEvidence(posting),
    components: valid ? leaves : [],
    componentCheck: valid ? "balanced" : "unavailable",
    componentsMeaning: "transaction_leaves_not_additional_amounts",
    costBasis: "unknown"
  }
}
