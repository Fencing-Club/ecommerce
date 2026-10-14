// Turborepo's remote cache (https://turborepo.dev/api/remote-cache-spec) on a Cloudflare Worker, with the artifacts in
// R2. Turbo signs each artifact itself (turbo.json's remoteCache.signature), so the cache only stores and returns bytes.

// The part of an R2 bucket binding the cache uses.
export interface ArtifactStore {
  get(key: string): Promise<{ body: ReadableStream; size: number; customMetadata?: Record<string, string> } | null>
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | null,
    options?: { customMetadata?: Record<string, string> }
  ): Promise<unknown>
}

export interface Env {
  ARTIFACTS: ArtifactStore
  // Each monorepo's token, by its SHA-256 in hex, and the one Turbo team (TURBO_TEAM) it may read and write, as JSON:
  // {"<sha256>": "ecommerce"}. Only hashes are stored, so the tokens never leave the machines that use them.
  TOKEN_TEAMS: string
}

const artifactPath = /^\/v8\/artifacts\/([0-9a-f]{1,128})$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

// The team the request's token belongs to, or null for a missing or unknown token. Looking up hashes rather than tokens
// means timing can reveal at most part of a hash, which no one can reverse.
async function tokenTeam(request: Request, env: Env) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]
  if (!token) {
    return null
  }
  const teams: Record<string, string> = JSON.parse(env.TOKEN_TEAMS || "{}")
  return teams[await sha256(token)] ?? null
}

// The team a request names, from Turbo's teamId or slug query parameter.
function requestedTeam(url: URL) {
  return url.searchParams.get("teamId") ?? url.searchParams.get("slug")
}

function artifactHeaders(object: { size: number; customMetadata?: Record<string, string> }) {
  const headers = new Headers({ "content-length": String(object.size) })
  const tag = object.customMetadata?.tag
  if (tag) {
    headers.set("x-artifact-tag", tag)
  }
  const duration = object.customMetadata?.duration
  if (duration) {
    headers.set("x-artifact-duration", duration)
  }
  return headers
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const team = await tokenTeam(request, env)
  if (!team) {
    return json({ error: { code: "unauthorized", message: "Unauthorized" } }, 401)
  }
  const url = new URL(request.url)
  // A token reads and writes only its own team's artifacts, kept under <team>/<hash>.
  const requested = requestedTeam(url)
  if (requested && requested !== team) {
    return json({ error: { code: "forbidden", message: "This token is for another team" } }, 403)
  }
  const scope = team

  if (url.pathname === "/v8/artifacts/status" && request.method === "GET") {
    return json({ status: "enabled" })
  }
  if (url.pathname === "/v8/artifacts/events" && request.method === "POST") {
    return json({})
  }
  // Which of the given hashes are cached, with their size, duration and tag.
  if (url.pathname === "/v8/artifacts" && request.method === "POST") {
    const { hashes } = (await request.json()) as { hashes?: unknown }
    const wanted = Array.isArray(hashes) ? hashes.filter((hash): hash is string => typeof hash === "string") : []
    const found = await Promise.all(
      wanted.map(async (hash) => [hash, await env.ARTIFACTS.head(`${scope}/${hash}`)] as const)
    )
    return json(
      Object.fromEntries(
        found.map(([hash, object]) => [
          hash,
          object
            ? {
                size: object.size,
                taskDurationMs: Number(object.customMetadata?.duration ?? 0),
                tag: object.customMetadata?.tag
              }
            : null
        ])
      )
    )
  }

  const hash = url.pathname.match(artifactPath)?.[1]
  if (!hash) {
    return json({ error: { code: "not_found", message: "Not found" } }, 404)
  }
  const key = `${scope}/${hash}`
  switch (request.method) {
    case "HEAD": {
      const object = await env.ARTIFACTS.head(key)
      return new Response(null, object ? { headers: artifactHeaders(object) } : { status: 404 })
    }
    case "GET": {
      const object = await env.ARTIFACTS.get(key)
      if (!object) {
        return json({ error: { code: "not_found", message: "Artifact not found" } }, 404)
      }
      const headers = artifactHeaders(object)
      headers.set("content-type", "application/octet-stream")
      return new Response(object.body, { headers })
    }
    case "PUT": {
      const customMetadata: Record<string, string> = {}
      const tag = request.headers.get("x-artifact-tag")
      if (tag) {
        customMetadata.tag = tag
      }
      const duration = request.headers.get("x-artifact-duration")
      if (duration) {
        customMetadata.duration = duration
      }
      await env.ARTIFACTS.put(key, request.body, { customMetadata })
      return json({ urls: [] }, 202)
    }
    default:
      return json({ error: { code: "method_not_allowed", message: "Method not allowed" } }, 405)
  }
}

export default { fetch: handle }
