import { AsyncLocalStorage } from "node:async_hooks"
import { deleteCookie, getCookie, getRequestHeaders, setCookie } from "@tanstack/react-start/server"
import type { AuthenticationResponse } from "@workos-inc/node"
import { WorkOS } from "@workos-inc/node"
import type { AuthResult } from "@workos/authkit-session"
import type { HeadersBag } from "@workos/authkit-session"
import type { Session } from "@workos/authkit-session"
import { CookieSessionStorage, createAuthService, getConfig, sessionEncryption } from "@workos/authkit-session"
import invariant from "tiny-invariant"
import type { SignInRequest } from "./sign-in"

export function signInRequest(): SignInRequest {
  const headers = getRequestHeaders()
  return {
    headers,
    // Cloudflare supplies this header at the edge. Client-supplied forwarded chains are not a trusted client address.
    ipAddress: headers.get("cf-connecting-ip") ?? undefined,
    cookies: {
      get: (name) => {
        const value = getCookie(name)
        return value === undefined ? undefined : { value }
      },
      set: setCookie,
      delete: (name) => deleteCookie(name, { path: "/" })
    },
    saveSession: saveAuthentication
  }
}

class StartSessionStorage extends CookieSessionStorage<Request, Response> {
  async getCookie(_request: Request, name: string) {
    // Start's parser returns the decoded value, including characters escaped by AuthKit's cookie serializer.
    return getCookie(name) ?? null
  }
}

function createSessionService() {
  return createAuthService({
    sessionStorageFactory: (config) => new StartSessionStorage(config),
    clientFactory: (config) =>
      new WorkOS(config.apiKey, {
        clientId: config.clientId,
        apiHostname: config.apiHostname,
        https: config.apiHttps,
        port: config.apiPort
      })
  })
}

type AuthenticationContext = {
  request: Request
  service: ReturnType<typeof createSessionService>
  authentication?: Promise<AuthResult>
  refreshedCookies: string[]
  explicitCookies?: string[]
}
const invocation = new AsyncLocalStorage<AuthenticationContext>()

function context() {
  const current = invocation.getStore()
  invariant(current, "Authentication requires a request context")
  return current
}

function sessionCookies(headers: HeadersBag | undefined) {
  return Object.entries(headers ?? {}).flatMap(([key, value]) => (key.toLowerCase() === "set-cookie" ? value : []))
}

// The service owns pending token refreshes and JWKS fetches. It must belong to this Worker invocation, not an isolate
// global: a different request cannot await another request's I/O. Only resolved configuration is shared by AuthKit.
export function withAuthentication(request: Request, handle: () => Response | Promise<Response>) {
  const current: AuthenticationContext = { request, service: createSessionService(), refreshedCookies: [] }
  return invocation.run(current, async () => {
    const response = await handle()
    const cookies = current.explicitCookies ?? current.refreshedCookies
    if (!cookies.length) {
      return response
    }
    const headers = new Headers(response.headers)
    for (const cookie of cookies) {
      headers.append("Set-Cookie", cookie)
    }
    headers.set("Cache-Control", "private, no-store")
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  })
}

// Validate the incoming session once per request. A decoded cookie alone is never evidence of authentication.
export function authentication() {
  const current = context()
  return (current.authentication ??= (async () => {
    const result = await current.service.withAuth(current.request)
    if (result.refreshedSessionData) {
      const saved = await current.service.saveSession(undefined, result.refreshedSessionData)
      current.refreshedCookies = sessionCookies(saved.headers)
    } else if (!result.auth.user && getCookie(getConfig("cookieName"))) {
      const cleared = await current.service.clearSession(new Response())
      current.refreshedCookies = sessionCookies(cleared.headers)
    }
    return result.auth
  })())
}

// Custom password/verification/OAuth flows keep the existing public AuthKit seal format and TTL. Explicit changes
// always take precedence over automatic refresh, including when a refresh finishes after a sign-in or sign-out.
export async function saveAuthentication(response: AuthenticationResponse) {
  const current = context()
  current.explicitCookies = []
  const session: Session = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
    ...(response.impersonator && { impersonator: response.impersonator })
  }
  const encrypted = await sessionEncryption.sealData(session, {
    password: getConfig("cookiePassword"),
    ttl: 0
  })
  const saved = await current.service.saveSession(undefined, encrypted)
  current.explicitCookies = sessionCookies(saved.headers)
}

export async function clearAuthentication() {
  const current = context()
  current.explicitCookies = []
  const cleared = await current.service.clearSession(new Response())
  current.explicitCookies = sessionCookies(cleared.headers)
}

export async function signOut(returnTo: string) {
  // Reserve the explicit change before awaiting validation/refresh. Even a rejected session clears the local cookie.
  const current = context()
  current.explicitCookies = []
  const auth = await authentication()
  await clearAuthentication()
  return auth.user
    ? current.service.getWorkOS().userManagement.getLogoutUrl({ sessionId: auth.sessionId, returnTo })
    : returnTo
}
