import { Client } from "pg"
import { z } from "zod"
import { amazonFinanceAudit } from "../src/server/amazon-finance-audit"

// Explicit audit connection only: never fall back to the app's DATABASE_URL or load its .env.
const config = z
  .object({
    ANALYTICS_AUDIT_DATABASE_URL: z.url(),
    ANALYTICS_AUDIT_ORG_ID: z.uuid(),
    ANALYTICS_AUDIT_ACCOUNT_ID: z.string().min(1)
  })
  .parse(process.env)
const url = new URL(config.ANALYTICS_AUDIT_DATABASE_URL)
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !["postgres:", "postgresql:"].includes(url.protocol)
) {
  throw new Error("Use an isolated local Postgres database containing the records to audit")
}
const client = new Client({ connectionString: url.toString() })
await client.connect()
try {
  await client.query("begin isolation level repeatable read read only")
  await client.query("set local statement_timeout = '30s'")
  const scope = [config.ANALYTICS_AUDIT_ORG_ID, config.ANALYTICS_AUDIT_ACCOUNT_ID]
  const coverage = await client.query(
    `select "coveredFrom", "coveredTo", "feesCoveredFrom", "feesCoveredTo", "feesErrorCode"
    from sales_syncs where "orgId" = $1 and source = 'amazon' and "externalAccountId" = $2`,
    scope
  )
  const audit = amazonFinanceAudit()
  let cursor: string | null = null
  for (;;) {
    const page = await client.query(
      `select t."transactionId", t."orderId", t."postedAt", t.type, t.currency,
      t."totalMinor", t."feesMinor", t.data,
      case when t."orderId" is null then null else exists (
        select 1 from sales_orders o where o."orgId" = t."orgId" and o."externalAccountId" = t."externalAccountId"
          and o.source = 'amazon' and o."orderId" = t."orderId"
      ) end as "hasStoredOrder"
      from amazon_transactions t where t."orgId" = $1 and t."externalAccountId" = $2
        and ($3::text is null or t."transactionId" > $3)
      order by t."transactionId" limit 1000`,
      [...scope, cursor]
    )
    for (const row of page.rows) {
      audit.inspect({ ...row, postedAt: z.date().parse(row.postedAt).toISOString() })
      cursor = z.string().parse(row.transactionId)
    }
    if (page.rows.length < 1000) {
      break
    }
  }
  process.stdout.write(
    JSON.stringify(
      {
        scope: { orgId: scope[0], accountId: scope[1] },
        recordedCoverage: coverage.rows[0] ?? null,
        ...audit.report()
      },
      null,
      2
    ) + "\n"
  )
} finally {
  try {
    await client.query("rollback")
  } finally {
    await client.end()
  }
}
