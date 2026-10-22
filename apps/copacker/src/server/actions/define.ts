import { z } from "zod"
import type { AccessLevel, Area } from "@/lib/access"
import type { ApiTag } from "@/lib/api-tags"
import { identity, session } from "@/server/auth"
import { signInRequest } from "@/server/auth-session"
import { requireAccess, requireAdmin, requireKind, requireOwner } from "@/server/authorization"
import { requestInput } from "@/server/errors"
import { requestLocale } from "@/server/localization"
import type { SignInRequest } from "@/server/sign-in"
import type { Session } from "@/server/workspace-session"

// One /api/action command: the data it takes, who can run it, what it does, and which of the browser's caches its
// success changes. The route reads the data with `input` (a request that doesn't fit is answered 400) only once the
// caller has passed its checks, then runs it.

// Who can run a member's action, checked in this order before its data is read. Each refusal is a 403.
export type Guard = {
  // Only the owner, or the owner and the admins.
  owner?: true
  admin?: true
  // The kind of workspace it's for.
  kind?: "buyer" | "supplier"
  // A page the member needs, at View unless `level` says Edit.
  area?: Area
  level?: AccessLevel
  // Whether it needs seeing prices too.
  prices?: true
}

// An action's data whose domain function reads its own fields, with its own schema.
export const fields = z.record(z.string(), z.unknown())

type Definition<S extends z.ZodType, R, C> = {
  input: S
  run: (input: z.output<S>, caller: C) => Promise<R>
  // The caches its success changes, which the browser loads again.
  invalidates?: readonly ApiTag[]
}

// `caller` finds who's asking and refuses anyone the action isn't for.
function action<S extends z.ZodType, R, C>(
  caller: () => Promise<C>,
  { input, run, invalidates = [] }: Definition<S, R, C>
) {
  return {
    input,
    run,
    invalidates,
    // Runs the action for the request's caller, with the request's data.
    async execute(data: unknown) {
      const who = await caller()
      return run(requestInput(input, data), who)
    }
  }
}

function checkGuard(s: Session, guard: Guard) {
  if (guard.owner) {
    requireOwner(s)
  }
  if (guard.admin) {
    requireAdmin(s)
  }
  if (guard.kind) {
    requireKind(s, guard.kind)
  }
  if (guard.area) {
    requireAccess(s, guard.area, guard.level)
  }
  if (guard.prices) {
    requireAccess(s, "prices")
  }
}

// An action in the open workspace, for its members that the guard lets through, or for a guard that depends on the
// workspace, such as which page a kind of workspace needs, for those its function lets through.
export function defineAction<S extends z.ZodType, R>({
  guard = {},
  ...definition
}: Definition<S, R, Session> & { guard?: Guard | ((s: Session) => void) }) {
  return action(async () => {
    // Resolve the profile language before a domain transaction holds a connection. A lazy lookup from inside that
    // transaction needs another connection and can deadlock a small Hyperdrive pool under concurrent submissions.
    await requestLocale()
    const s = await session()
    if (typeof guard === "function") {
      guard(s)
    } else {
      checkGuard(s, guard)
    }
    return s
  }, definition)
}

type Person = Awaited<ReturnType<typeof identity>>

// An action for someone signed in, who may not have a workspace yet: getting started, or recovering from one that has
// gone. Someone signed out goes to sign in, and then to `returnTo`.
export function signedInAction<S extends z.ZodType, R>({
  returnTo,
  ...definition
}: Definition<S, R, Person> & { returnTo?: string }) {
  return action(async () => {
    await requestLocale()
    return identity(returnTo)
  }, definition)
}

// An action before anyone signs in: signing in and up.
export function publicAction<S extends z.ZodType, R>(definition: Definition<S, R, SignInRequest>) {
  return action(async () => signInRequest(), definition)
}
