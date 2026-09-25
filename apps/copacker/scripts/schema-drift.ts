// Compares the live schema at DATABASE_URL with the schema the migrations build, read-only on both sides.
// Usage: pnpm db:drift (with REFERENCE_DATABASE_URL pointing at a scratch database, such as the local Docker one).
import { Client } from "pg"

async function describe(url: string, ca?: string) {
  const client = new Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : undefined })
  await client.connect()
  try {
    await client.query("begin read only")
    const rows = async (sql: string) =>
      (await client.query<Record<string, string>>(sql)).rows.map((row) => Object.values(row).join(" | "))
    return [
      ...(await rows(`select 'column', table_name, column_name, data_type, is_nullable, coalesce(column_default, '')
        from information_schema.columns where table_schema = 'public'`)),
      ...(await rows(`select 'constraint', conrelid::regclass::text, conname, pg_get_constraintdef(oid)
        from pg_constraint where connamespace = 'public'::regnamespace`)),
      ...(await rows(`select 'index', tablename, indexname, indexdef from pg_indexes where schemaname = 'public'`))
    ].toSorted()
  } finally {
    await client.query("rollback")
    await client.end()
  }
}

const live = process.env.DATABASE_URL
const reference = process.env.REFERENCE_DATABASE_URL
if (!live || !reference) {
  throw new Error("Set DATABASE_URL (live) and REFERENCE_DATABASE_URL (freshly migrated)")
}
const [actual, expected] = await Promise.all([describe(live, process.env.DATABASE_CA_CERT), describe(reference)])
const missing = expected.filter((line) => !actual.includes(line))
const unexpected = actual.filter((line) => !expected.includes(line))
for (const line of missing) {
  process.stdout.write(`missing from live: ${line}\n`)
}
for (const line of unexpected) {
  process.stdout.write(`only in live:      ${line}\n`)
}
process.stdout.write(missing.length || unexpected.length ? "Schema drift found.\n" : "No schema drift.\n")
process.exit(missing.length || unexpected.length ? 1 : 0)
