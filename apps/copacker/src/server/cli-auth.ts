import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import invariant from "tiny-invariant"
import { z } from "zod"
import { db, type Transaction } from "@/db"
import { cliAuthorizations, cliGrants, cliTokens } from "@/db/schema"
import { hash, token } from "./security"
import { workos } from "./workos"

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}
const invalidGrant = () => new CliError("invalid_grant", "Sign in again to authorize the CLI.", 401)
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const cliAuthorizationInput = z.strictObject({
  response_type: z.literal("code"),
  client_id: z.literal("copacker-cli"),
  redirect_uri: z.string().refine((value) => {
    if (!URL.canParse(value)) {
      return false
    }
    const url = new URL(value)
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      Boolean(url.port) &&
      url.pathname === "/callback" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password &&
      url.href === value
    )
  }, "Use the CLI's loopback callback."),
  state: secret,
  code_challenge: secret,
  code_challenge_method: z.literal("S256")
})
export function authorizationParams(params: URLSearchParams) {
  if (new Set(params.keys()).size !== [...params.keys()].length) {
    throw new CliError("invalid_request", "Duplicate parameters.")
  }
  const parsed = cliAuthorizationInput.safeParse(Object.fromEntries(params))
  if (!parsed.success) {
    throw new CliError("invalid_request", "Invalid CLI authorization request.")
  }
  return parsed.data
}
export async function prepareCliConsent(userId: string, input: z.infer<typeof cliAuthorizationInput>) {
  const intent = token()
  await db()
    .insert(cliAuthorizations)
    .values({
      hash: hash(intent),
      userId,
      redirectUri: input.redirect_uri,
      challenge: input.code_challenge,
      state: input.state,
      expiresAt: new Date(Date.now() + 10 * 60_000)
    })
  return intent
}
export async function approveCliConsent(userId: string, intent: string, state: string, approved: boolean) {
  // The browser must explicitly POST a user-bound, single-use intent; loading the page grants nothing.
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(cliAuthorizations)
      .where(eq(cliAuthorizations.hash, hash(intent)))
      .for("update")
    if (
      !row ||
      row.userId !== userId ||
      row.state !== state ||
      row.approvedAt ||
      row.consumedAt ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      throw invalidGrant()
    }
    const callback = new URL(row.redirectUri)
    callback.searchParams.set("state", secret.parse(state))
    if (!approved) {
      await tx.delete(cliAuthorizations).where(eq(cliAuthorizations.hash, row.hash))
      callback.searchParams.set("error", "access_denied")
    } else {
      const code = token()
      await tx
        .update(cliAuthorizations)
        .set({ approvedAt: new Date(), codeHash: hash(code), expiresAt: new Date(Date.now() + 5 * 60_000) })
        .where(eq(cliAuthorizations.hash, row.hash))
      callback.searchParams.set("code", code)
    }
    return callback.href
  })
}
async function issueTokens(tx: Transaction, grant: typeof cliGrants.$inferSelect) {
  const access = token(),
    refresh = token()
  const expires = new Date(Math.min(Date.now() + 15 * 60_000, grant.expiresAt.getTime()))
  await tx.insert(cliTokens).values([
    { hash: hash(access), grantId: grant.id, kind: "access", expiresAt: expires },
    { hash: hash(refresh), grantId: grant.id, kind: "refresh", expiresAt: grant.expiresAt }
  ])
  return {
    access_token: access,
    refresh_token: refresh,
    token_type: "Bearer" as const,
    expires_in: Math.floor((expires.getTime() - Date.now()) / 1000)
  }
}
export async function exchangeCliCode(code: string, verifier: string, redirectUri: string) {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(cliAuthorizations)
      .where(eq(cliAuthorizations.codeHash, hash(code)))
      .for("update")
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    if (
      !row ||
      !row.approvedAt ||
      row.consumedAt ||
      row.expiresAt.getTime() <= Date.now() ||
      row.redirectUri !== redirectUri ||
      row.challenge !== challenge
    ) {
      throw invalidGrant()
    }
    await tx.update(cliAuthorizations).set({ consumedAt: new Date() }).where(eq(cliAuthorizations.hash, row.hash))
    const [grant] = await tx
      .insert(cliGrants)
      .values({ userId: row.userId, expiresAt: new Date(Date.now() + 30 * 86400_000) })
      .returning()
    invariant(grant)
    return issueTokens(tx, grant)
  })
}
export async function refreshCliToken(value: string) {
  const result = await db().transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(cliTokens)
      .where(and(eq(cliTokens.hash, hash(value)), eq(cliTokens.kind, "refresh")))
    if (!stored) {
      return null
    }
    // All refreshes/revocations serialize on the grant, then re-read the token after obtaining the lock.
    const [grant] = await tx.select().from(cliGrants).where(eq(cliGrants.id, stored.grantId)).for("update")
    const [current] = await tx.select().from(cliTokens).where(eq(cliTokens.hash, stored.hash))
    if (!grant || !current || grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) {
      return null
    }
    if (current.consumedAt) {
      await tx.update(cliGrants).set({ revokedAt: new Date() }).where(eq(cliGrants.id, grant.id))
      return null // Commit family revocation before reporting the error.
    }
    if (current.expiresAt.getTime() <= Date.now()) {
      return null
    }
    await tx.update(cliTokens).set({ consumedAt: new Date() }).where(eq(cliTokens.hash, stored.hash))
    return issueTokens(tx, grant)
  })
  if (!result) {
    throw invalidGrant()
  }
  return result
}
export async function revokeCliToken(value: string) {
  const [stored] = await db()
    .select()
    .from(cliTokens)
    .where(eq(cliTokens.hash, hash(value)))
  if (stored) {
    await db().update(cliGrants).set({ revokedAt: new Date() }).where(eq(cliGrants.id, stored.grantId))
  }
}
export function requireCliRequest(request: Request) {
  // CLI endpoints never accept ambient browser authority. They intentionally don't enable CORS.
  if (request.headers.has("cookie") || request.headers.has("origin") || request.headers.has("sec-fetch-site")) {
    throw new CliError("invalid_request", "Use CLI credentials without browser cookies.", 401)
  }
}
export async function cliPrincipal(request: Request) {
  requireCliRequest(request)
  const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!bearer) {
    throw invalidGrant()
  }
  const [row] = await db()
    .select({ token: cliTokens, grant: cliGrants })
    .from(cliTokens)
    .innerJoin(cliGrants, eq(cliTokens.grantId, cliGrants.id))
    .where(and(eq(cliTokens.hash, hash(bearer)), eq(cliTokens.kind, "access")))
  if (
    !row ||
    row.grant.revokedAt ||
    row.token.expiresAt.getTime() <= Date.now() ||
    row.grant.expiresAt.getTime() <= Date.now()
  ) {
    throw invalidGrant()
  }
  // Resolve the identity afresh, never accept a deleted account from a token's old claims.
  const user = await workos()
    .userManagement.getUser(row.grant.userId)
    .catch((error: unknown) => {
      if (error instanceof Error && "status" in error && error.status === 404) {
        throw invalidGrant()
      }
      throw new CliError("identity_unavailable", "Copacker could not verify your account. Try again shortly.", 503)
    })
  return { user, grantId: row.grant.id, expiresAt: row.token.expiresAt.toISOString() }
}
