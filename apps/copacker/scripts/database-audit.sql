-- Read-only migration acceptance. Run with psql -X -At -v ON_ERROR_STOP=1 -f database-audit.sql.
-- Hashes include every row, with stable ordering, without emitting customer records or encrypted tokens.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format(
  'SELECT %L, count(*), md5(coalesce(string_agg(md5(row_to_json(t)::text), '''' ORDER BY md5(row_to_json(t)::text)), '''')) FROM %I.%I t;',
  schemaname || '.' || tablename, schemaname, tablename
)
FROM pg_tables WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, tablename
\gexec
SELECT 'function', p.proname, md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname, p.oid::regprocedure::text;
SELECT 'sequence', schemaname, sequencename, start_value, min_value, max_value, increment_by, cycle, last_value
FROM pg_sequences WHERE schemaname IN ('public', 'drizzle') ORDER BY schemaname, sequencename;
COMMIT;
