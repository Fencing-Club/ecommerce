import { randomUUID } from "node:crypto"
import {
  canonicalJson,
  connectionOperations,
  createRegistry,
  isQuery,
  jsonObject,
  operationSummarySchema,
  parseInput,
  requestSchema,
  setupOperations,
  usesAccountContext,
  type OperationDefinition
} from "@repo/copacker-contract"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db, type Executor } from "@/db"
import { cliGrants, memberships, operationReceipts } from "@/db/schema"
import { accessSchema, effectiveAccess, isAdmin } from "@/lib/access"
import { CliError, cliPrincipal } from "./cli-auth"
import { boundedBody } from "./cli-http"
import { connectionSettings, operationConnections, updateConnectionSettings } from "./operation-connections"
import { hash, sign, verifySignature } from "./security"
import { workspaceMemberships, workspaceSession, type Session } from "./workspace-session"

type Context = {
  principal: Awaited<ReturnType<typeof cliPrincipal>>
  session: Session | null
  operation: string
  input: unknown
  executor: Executor
}
const setup = setupOperations(accessSchema)
const member = (context: Context) => Boolean(context.session)
const buyer = (context: Context) => context.session?.org.kind === "buyer"
const admin = (context: Context) => buyer(context) && context.session !== null && isAdmin(context.session)
const account = () => true
function session(context: Context) {
  if (!context.session) {
    throw new CliError("forbidden", "Select an accessible workspace.", 403)
  }
  return context.session
}
function entry<I extends z.ZodType, O extends z.ZodType>(
  definition: OperationDefinition<I, O>,
  allowed: (context: Context) => boolean,
  handle: (input: z.output<I>, context: Context) => Promise<unknown> | unknown
) {
  return {
    definition,
    allowed,
    execute: async (input: unknown, context: Context) =>
      definition.output.parse(await handle(definition.input.parse(input), context))
  }
}
type Entry = {
  definition: OperationDefinition
  allowed: (context: Context) => boolean
  execute: (input: unknown, context: Context) => Promise<unknown>
}
const entries: Entry[] = [
  entry(setup["account.show"], account, (_, { principal }) => ({
    id: principal.user.id,
    email: principal.user.email,
    name: principal.user.name,
    workspaceId: null,
    authentication: { kind: "interactive", credentialId: null, expiresAt: principal.expiresAt, scopes: [] }
  })),
  entry(setup["workspace.list"], account, async (input, context) => {
    const rows = await workspaceMemberships(context.principal.user.id)
    const items = await Promise.all(
      rows.map(async ({ org }) => {
        const current = await workspaceSession(context.principal.user, org.id)
        return current ? workspace({ ...context, session: current }) : null
      })
    )
    return page(
      items.filter((item) => item !== null).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      input,
      context
    )
  }),
  entry(setup["workspace.show"], member, (_, context) => workspace(context)),
  entry(setup["schema.show"], account, ({ operation }, context) => {
    const found = entries.find((item) => item.definition.descriptor.operation === operation)
    if (
      !found ||
      !found.allowed(context) ||
      (!context.session && !["account.show", "workspace.list"].includes(operation))
    ) {
      throw new CliError("not_found", "Operation is unavailable to this caller.", 404)
    }
    return found.definition.descriptor
  }),
  entry(setup["schema.list"], member, (input, context) =>
    page(
      available(context)
        .filter((item) => !input.prefix || item.operation.startsWith(input.prefix))
        .sort((a, b) => a.operation.localeCompare(b.operation))
        .map((item) => operationSummarySchema.parse(item)),
      input,
      context
    )
  ),
  entry(connectionOperations["connection.list"], buyer, async (input, context) =>
    page(
      (await operationConnections(session(context))).filter(
        (row) => !input.provider || row.provider === input.provider
      ),
      input,
      context
    )
  ),
  entry(connectionOperations["connection.show"], buyer, async ({ id }, context) => {
    const row = (await operationConnections(session(context))).find((item) => item.id === id)
    if (!row) {
      throw new CliError("not_found", "Connection not found.", 404)
    }
    return row
  }),
  entry(connectionOperations["connection.settings.show"], admin, ({ id }, context) =>
    connectionSettings(session(context), id, context.executor)
  ),
  entry(connectionOperations["connection.settings.update"], admin, (input, context) =>
    updateConnectionSettings(session(context), input, context.executor)
  )
]
const registry = createRegistry(entries.map((item) => item.definition))
function available(context: Context) {
  return entries.filter((item) => item.allowed(context)).map((item) => item.definition.descriptor)
}
function workspace(context: Context) {
  const s = session(context)
  const deployed = available(context)
  return {
    id: s.org.id,
    name: s.org.name,
    kind: s.org.kind,
    role: s.role,
    access: s.access,
    effectiveScopes: [...new Set(deployed.flatMap((item) => item.accessPolicy.scopes))],
    capabilities: deployed.map((item) => ({ operation: item.operation, available: true, reason: null }))
  }
}
const cursorSchema = z.strictObject({ binding: z.string(), after: z.string(), expires: z.number() })
function page<T>(items: T[], input: { limit?: number; cursor?: string }, context: Context) {
  const { cursor: _cursor, limit: _limit, ...filters } = z.record(z.string(), z.unknown()).parse(context.input)
  const binding = hash(
    canonicalJson({
      principal: context.principal.user.id,
      workspace: context.session?.org.id ?? null,
      operation: context.operation,
      filters
    })
  )
  let start = 0
  if (input.cursor) {
    try {
      const [value, signature, extra] = input.cursor.split(".")
      if (!value || !signature || extra || !verifySignature(value, "operation-cursor", signature)) {
        throw new Error()
      }
      const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")))
      if (parsed.binding !== binding || parsed.expires <= Date.now()) {
        throw new Error()
      }
      // The lists here are small control-plane inventories. Refuse changed pages rather than silently skipping data.
      const previous = items.findIndex((item) => hash(canonicalJson(item)) === parsed.after)
      if (previous < 0) {
        throw new Error()
      }
      start = previous + 1
    } catch {
      throw new CliError("invalid_cursor", "The list changed or the cursor expired. Start the list again.", 409)
    }
  }
  const selected = items.slice(start, start + (input.limit ?? 50))
  const last = selected.at(-1)
  const more = start + selected.length < items.length && last !== undefined
  const value = more
    ? Buffer.from(
        JSON.stringify({ binding, after: hash(canonicalJson(last)), expires: Date.now() + 30 * 60_000 })
      ).toString("base64url")
    : null
  return {
    items: selected,
    page: {
      nextCursor: value ? `${value}.${sign(value, "operation-cursor")}` : null,
      hasMore: more,
      consistency: "live"
    }
  }
}
async function mutation(
  context: Context,
  key: string | null,
  input: unknown,
  run: (context: Context) => Promise<unknown>
) {
  if (!key || !/^[\x21-\x7e]{1,200}$/.test(key)) {
    throw new CliError("idempotency_key_required", "Supply an Idempotency-Key for this change.")
  }
  const s = session(context)
  const fingerprint = hash(canonicalJson(input))
  return db().transaction(async (tx) => {
    const [grant] = await tx.select().from(cliGrants).where(eq(cliGrants.id, context.principal.grantId)).for("share")
    if (!grant || grant.revokedAt || grant.expiresAt.getTime() <= Date.now()) {
      throw new CliError("unauthenticated", "Sign in again.", 401)
    }
    // Lock and recheck membership before writing, so a permission change cannot race a business mutation.
    const [current] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, s.org.id), eq(memberships.userId, s.user.id)))
      .for("share")
    const found = entries.find((item) => item.definition.descriptor.operation === context.operation)
    const fresh = current
      ? {
          ...context,
          executor: tx,
          session: { ...s, role: current.role, access: effectiveAccess(s.org.kind, current.access) }
        }
      : null
    if (!fresh || !found?.allowed(fresh)) {
      throw new CliError("forbidden", "Workspace access changed.", 403)
    }
    const where = and(
      eq(operationReceipts.userId, s.user.id),
      eq(operationReceipts.orgId, s.org.id),
      eq(operationReceipts.operation, context.operation),
      eq(operationReceipts.key, key)
    )
    const created = await tx
      .insert(operationReceipts)
      .values({ userId: s.user.id, orgId: s.org.id, operation: context.operation, key, fingerprint })
      .onConflictDoNothing()
      .returning()
    if (!created.length) {
      const [saved] = await tx.select().from(operationReceipts).where(where).for("update")
      if (!saved || saved.fingerprint !== fingerprint) {
        throw new CliError("idempotency_conflict", "This key was used for another request.", 409)
      }
      if (saved.createdAt.getTime() + 7 * 86400_000 <= Date.now()) {
        throw new CliError("idempotency_expired", "This execution expired. Review before starting a new one.", 409)
      }
      return saved.result
    }
    const result = await run(fresh)
    await tx.update(operationReceipts).set({ result }).where(where)
    return result
  })
}
export async function operationResponse(request: Request, operation: string) {
  const requestId = randomUUID()
  let workspaceId: string | null = null
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }
  try {
    const principal = await cliPrincipal(request)
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
      throw new CliError("invalid_input", "Expected application/json.", 415)
    }
    let body: z.infer<typeof requestSchema>
    try {
      body = requestSchema.parse(parseInput(await boundedBody(request, 1048576)))
    } catch (error) {
      if (error instanceof CliError) {
        throw error
      }
      throw new CliError("invalid_input", "Invalid operation request.")
    }
    workspaceId = body.workspaceId ?? null
    const accountContext = usesAccountContext(operation, body.input)
    if (accountContext && body.workspaceId) {
      throw new CliError("invalid_input", "This operation uses account context; omit workspaceId.")
    }
    const current =
      !accountContext && body.workspaceId ? await workspaceSession(principal.user, body.workspaceId) : null
    if (!accountContext && !current) {
      throw new CliError("forbidden", "Select an accessible workspace.", 403)
    }
    const context: Context = { principal, session: current, operation, input: body.input, executor: db() }
    const found = entries.find((item) => item.definition.descriptor.operation === operation)
    const definition = registry.get(operation)
    if (!found || !definition || !found.allowed(context)) {
      throw new CliError("not_found", "Operation is unavailable to this caller.", 404)
    }
    const parsed = definition.input.safeParse(body.input)
    if (!parsed.success) {
      throw new CliError("invalid_input", "The input does not match this operation's schema.")
    }
    const isRead = isQuery(definition.descriptor, jsonObject.parse(parsed.data))
    const result = isRead
      ? await found.execute(parsed.data, context)
      : await mutation(context, request.headers.get("idempotency-key"), parsed.data, (fresh) =>
          found.execute(parsed.data, fresh)
        )
    const data = definition.output.parse(result)
    return Response.json(
      {
        data,
        meta: {
          requestId,
          workspaceId,
          generatedAt: new Date().toISOString(),
          completeness: "complete",
          sources: [
            {
              provider: "copacker",
              accountId: null,
              dataset: operation,
              observedAt: new Date().toISOString(),
              freshness: "current",
              availability: "available",
              staleAfter: null
            }
          ],
          warnings: [],
          redactedFields: []
        }
      },
      { headers }
    )
  } catch (error) {
    const known = error instanceof CliError
    let code = known ? error.code : "internal_error"
    if (known && error.status === 401) {
      code = "unauthenticated"
    }
    if (known && error.status === 403) {
      code = "permission_denied"
    }
    return Response.json(
      {
        error: {
          code,
          message: known ? error.message : "Copacker could not complete this operation.",
          retryable: !known || error.status === 503,
          issues: [],
          recovery: null,
          details: {}
        },
        meta: { requestId, workspaceId }
      },
      { status: known ? error.status : 500, headers }
    )
  }
}
