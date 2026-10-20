import { generateDrizzleJson, generateMigration } from "drizzle-kit/api"
import * as schema from "../src/db/schema"

// SQL functions the app's queries call. Drizzle's schema can't describe them, so they're kept here as well as in the
// migrations; a migration that changes one changes it here too.
const functions = `
CREATE FUNCTION fx_per_usd(text, timestamptz) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN $1 = 'USD' THEN 1::numeric ELSE coalesce(
    (SELECT r."perUsd" FROM exchange_rates r WHERE r.currency = $1 AND r.day <= ($2 AT TIME ZONE 'UTC')::date
      ORDER BY r.day DESC LIMIT 1),
    (SELECT r."perUsd" FROM exchange_rates r WHERE r.currency = $1 ORDER BY r.day LIMIT 1)) END
$$;
CREATE FUNCTION fx_rate(text, text, timestamptz) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN $1 = $2 THEN 1::numeric ELSE fx_per_usd($2, $3) / fx_per_usd($1, $3) END
$$;
`

// The current schema as SQL, from src/db/schema.ts rather than the migrations, which tests never run.
export async function databaseSchemaSql() {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  return `${statements.map((statement) => statement.replace(/;?\s*$/, ";")).join("\n")}\n${functions}`
}
