import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { apiOrigin, clientError } from "@repo/copacker-client"
import { z } from "zod"
import { LocalStore, runProtected, type LoginSecret } from "./storage.ts"

const tokenResponse = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional()
})

export async function tokenRequest(baseUrl: string, body: URLSearchParams): Promise<LoginSecret> {
  const response = await fetch(`${apiOrigin(baseUrl)}/api/cli/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(30000)
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw clientError("unauthenticated", "Copacker could not authorize this session. Run login again.", 401)
  }
  const parsed = tokenResponse.safeParse(await response.json())
  if (!parsed.success) {
    throw clientError("unsupported_contract", "The server returned an unsupported authentication response.", 409)
  }
  return {
    kind: "interactive",
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000
  }
}

export async function openBrowser(url: string): Promise<void> {
  if (process.platform === "win32") {
    await runProtected(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath ([Console]::In.ReadToEnd())"],
      url
    )
  } else {
    await runProtected(process.platform === "darwin" ? "open" : "xdg-open", [url])
  }
}

export async function login(
  store: LocalStore,
  profile: string,
  baseUrl: string,
  report: (message: string) => void,
  browser = true
) {
  apiOrigin(baseUrl)
  const probe = `login-probe-${randomUUID()}`
  await store.saveCredential(probe, { kind: "interactive", accessToken: "storage-availability-check" })
  await store.clearCredential(probe)
  const verifier = randomBytes(48).toString("base64url")
  const state = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  let resolveCode: (code: string) => void = () => undefined
  let rejectCode: (error: Error) => void = () => undefined
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // Attach a rejection handler immediately, including while the browser is opening.
  void code.catch(() => undefined)
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (request.method !== "GET" || url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
      response.writeHead(400).end("Invalid sign-in callback.")
      return
    }
    response.setHeader("Content-Type", "text/plain; charset=utf-8")
    response.setHeader("Cache-Control", "no-store")
    const value = url.searchParams.get("code")
    if (url.searchParams.has("error") || !value) {
      response.writeHead(400).end("Sign-in was not completed.")
      rejectCode(clientError("unauthenticated", "Sign-in was not completed.", 401))
      return
    }
    response.end("Signed in to Copacker. You can close this tab.")
    resolveCode(value)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw clientError("invalid_input", "Could not open the local sign-in callback.")
  }
  const redirectUri = `http://127.0.0.1:${address.port}/callback`
  const url = new URL("/api/cli/authorize", baseUrl)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: "copacker-cli",
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString()
  const timer = setTimeout(
    () => rejectCode(clientError("wait_timeout", "Sign-in expired. Run login again.", 408)),
    180000
  )
  try {
    report(`Complete sign-in in your browser: ${url.href}`)
    if (browser) {
      await openBrowser(url.href).catch(() => report("Open the sign-in link above to continue."))
    }
    const secret = await tokenRequest(
      baseUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "copacker-cli",
        redirect_uri: redirectUri,
        code: await code,
        code_verifier: verifier
      })
    )
    await store.saveCredential(profile, secret)
    const previous = await store.profile(profile)
    await store.saveProfile(profile, { ...previous, baseUrl })
    return { authenticated: true, profile }
  } finally {
    clearTimeout(timer)
    server.closeAllConnections()
    server.close()
  }
}

export async function logout(
  store: LocalStore,
  profile: string,
  baseUrl: string
): Promise<{ cleared: boolean; revoked: boolean }> {
  const credential = await store.credential(profile)
  if (credential?.kind === "automation") {
    throw clientError("invalid_input", "Use account credential revoke to revoke an automation credential.")
  }
  let revoked = !credential
  try {
    if (credential) {
      const response = await fetch(`${apiOrigin(baseUrl)}/api/cli/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: credential.refreshToken ?? credential.accessToken,
          client_id: "copacker-cli"
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(30000)
      })
      revoked = response.ok
      await response.body?.cancel()
    }
  } catch {
    revoked = false
  } finally {
    await store.clearCredential(profile)
  }
  return { cleared: true, revoked }
}

export async function profileToken(store: LocalStore, profile: string, baseUrl: string): Promise<string> {
  const secret = await store.credential(profile)
  if (!secret) {
    throw clientError("unauthenticated", "Run copacker login or set COPACKER_TOKEN.", 401)
  }
  if (secret.expiresAt !== undefined && secret.expiresAt <= Date.now() + 30000) {
    if (!secret.refreshToken) {
      throw clientError("unauthenticated", "This credential has expired. Sign in again.", 401)
    }
    const fresh = await tokenRequest(
      baseUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "copacker-cli",
        refresh_token: secret.refreshToken
      })
    )
    if (!fresh.refreshToken) {
      throw clientError("unsupported_contract", "The server did not rotate the refresh token.", 409)
    }
    await store.saveCredential(profile, fresh)
    return fresh.accessToken
  }
  return secret.accessToken
}
