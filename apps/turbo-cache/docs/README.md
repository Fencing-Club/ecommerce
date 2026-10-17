# Turbo remote cache

The [Turborepo remote cache](https://turborepo.dev/docs/core-concepts/remote-caching) every monorepo shares: the
`shared-turbo-cache` Cloudflare Worker at `https://turbo.copacker.ai`, which stores task outputs in the
`shared-turbo-cache` R2 bucket. A task whose inputs haven't changed is replayed from the cache instead of run again, on
any CI runner or machine that has its repo's token.

- **Protocol:** Turborepo's `/v8/artifacts` API (`src/index.ts`): status, `HEAD`/`GET`/`PUT` of an artifact, and the
  batch existence query.
- **One team per monorepo:** each monorepo sets its own `TURBO_TEAM` (ecommerce's is `ecommerce`) and has its own token.
  A token reads and writes only its team's artifacts, kept under `<team>/<hash>`; asking for another team gets 403.
- **Access:** the Worker's `TOKEN_TEAMS` secret maps each token's SHA-256 to its team, as JSON
  (`{"<sha256>": "ecommerce"}`). Only hashes are stored, so the tokens live only in each repo's GitHub secrets
  (`TURBO_TOKEN`) and on the machines that use them.
- **Integrity:** each repo's `turbo.json` sets `remoteCache.signature`, so Turbo signs every artifact with that repo's
  `TURBO_REMOTE_CACHE_SIGNATURE_KEY` and rejects any it can't verify. The Worker never sees the keys.
- **Retention:** the bucket deletes artifacts 30 days after they're written.

Use Turbo 2.11.9 or later. Version 2.10.13 can sign large disk-backed artifacts incorrectly after writing the local
cache, making remote restores miss despite successful uploads. The updated client uses independent readers for
signing, local copies and uploads; keep signature verification enabled.

## Using it

A repo's CI sets `TURBO_API=https://turbo.copacker.ai`, `TURBO_TEAM`, `TURBO_TOKEN` and
`TURBO_REMOTE_CACHE_SIGNATURE_KEY` for every job. To share the cache from your own machine, set the same four variables
in your shell; without them Turbo uses only its local cache.

## Adding a monorepo

1. Generate a token and a signature key, 32 random bytes each in hex (`openssl rand -hex 32`), and keep them out of any
   file in a repo.
2. Add both to the repo's GitHub secrets, for Actions and Dependabot, as `TURBO_TOKEN` and
   `TURBO_REMOTE_CACHE_SIGNATURE_KEY`, and set the four variables above in its workflow with a team name of its own.
3. Add the token's SHA-256 and the team to `TOKEN_TEAMS`: `pnpm dlx wrangler secret put TOKEN_TEAMS` from this folder,
   with the whole JSON map on stdin. The secret replaces the old map, so include every repo's entry.

## Deploying

From this folder, signed in with `pnpm dlx wrangler login`:

1. `pnpm dlx wrangler r2 bucket create shared-turbo-cache`, once, then give it a 30-day expiry rule in the dashboard or
   with `pnpm dlx wrangler r2 bucket lifecycle add shared-turbo-cache expire-artifacts --expire-days 30`.
2. `pnpm dlx wrangler deploy`, which also serves it at `turbo.copacker.ai`.
3. `pnpm dlx wrangler secret put TOKEN_TEAMS`, with the JSON map on stdin.
