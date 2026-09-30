# Turbo remote cache

The monorepo's [Turborepo remote cache](https://turborepo.dev/docs/core-concepts/remote-caching): a Cloudflare Worker at
`https://turbo.copacker.ai` that stores task outputs in the `turbo-cache` R2 bucket. A task whose inputs haven't changed
is replayed from the cache instead of run again, on any CI runner or machine that has the token.

- **Protocol:** Turborepo's `/v8/artifacts` API (`src/index.ts`): status, `HEAD`/`GET`/`PUT` of an artifact, and the
  batch existence query. Artifacts are kept per team, under `<team>/<hash>`.
- **Access:** a bearer token. The Worker keeps only its SHA-256 (the `TOKEN_SHA256` secret), so the token lives only in
  GitHub (`TURBO_TOKEN`) and on the machines that use it.
- **Integrity:** `turbo.json` sets `remoteCache.signature`, so Turbo signs every artifact with
  `TURBO_REMOTE_CACHE_SIGNATURE_KEY` and rejects any it can't verify. The Worker never sees that key.
- **Retention:** the bucket deletes artifacts 30 days after they're written.

## Using it

CI sets `TURBO_API`, `TURBO_TEAM`, `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` for every job. To share the cache
from your own machine, set the same four variables in your shell; without them Turbo uses only its local cache.

## Deploying

From this folder, signed in with `pnpm dlx wrangler login`:

1. `pnpm dlx wrangler r2 bucket create turbo-cache`, once, then give it a 30-day expiry rule in the dashboard or with
   `pnpm dlx wrangler r2 bucket lifecycle add turbo-cache expire-artifacts --expire-days 30`.
2. `pnpm dlx wrangler deploy`, which also serves it at `turbo.copacker.ai`.
3. `pnpm dlx wrangler secret put TOKEN_SHA256`, with the token's SHA-256 in hex on stdin.
