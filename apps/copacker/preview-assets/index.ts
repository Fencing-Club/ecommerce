const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin"
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } })
    }
    const url = new URL(request.url)
    const match = /^\/pr-([1-9]\d*)\/storybook(?:\/(.*))?$/.exec(url.pathname)
    if (!match) {
      return new Response(null, { status: 404, headers })
    }
    let file: string
    try {
      file = decodeURIComponent(match[2] || "index.html")
    } catch {
      return new Response(null, { status: 400, headers })
    }
    // Reject encoded control characters as well as path traversal and double encoding.
    // eslint-disable-next-line no-control-regex
    if (/[\\%\u0000-\u001f\u007f]/.test(file) || file.split("/").some((part) => !part || part.startsWith("."))) {
      return new Response(null, { status: 404, headers })
    }
    const prefix = `previews/pr-${match[1]}/storybook/`
    try {
      // Never serve a cached object without checking that this preview is still published.
      const marker = await env.DOCUMENTS.get(`${prefix}.release.json`)
      if (!marker) {
        return new Response(null, { status: 404, headers })
      }
      if (marker.size > 256) {
        await marker.body.cancel()
        return new Response(null, { status: 502, headers })
      }
      const release = await marker.json<unknown>()
      if (
        !release ||
        typeof release !== "object" ||
        !("commit" in release) ||
        !("version" in release) ||
        typeof release.commit !== "string" ||
        !/^[a-f0-9]{40}$/.test(release.commit) ||
        typeof release.version !== "string" ||
        !/^[a-f0-9-]{36}$/.test(release.version)
      ) {
        return new Response(null, { status: 502, headers })
      }
      if (match[2] === undefined) {
        url.pathname += "/"
        return new Response(null, { status: 308, headers: { ...headers, Location: url.href } })
      }
      if (file === "health.json") {
        return new Response(request.method === "HEAD" ? null : JSON.stringify({ commit: release.commit }), {
          headers: { ...headers, "Content-Type": "application/json" }
        })
      }
      const cacheUrl = new URL(request.url)
      cacheUrl.search = new URLSearchParams({ version: release.version }).toString()
      const cacheKey = new Request(cacheUrl, { method: "GET" })
      const cache = await caches.open("preview-assets")
      let response = await cache.match(cacheKey)
      if (!response) {
        const object = await env.DOCUMENTS.get(`${prefix}${release.version}/${file}`)
        if (!object) {
          return new Response(null, { status: 404, headers })
        }
        const metadata = new Headers(headers)
        object.writeHttpMetadata(metadata)
        metadata.set("ETag", object.httpEtag)
        metadata.set("Cache-Control", "public, max-age=86400")
        response = new Response(object.body, { headers: metadata })
        ctx.waitUntil(cache.put(cacheKey, response.clone()))
      }
      const metadata = new Headers(response.headers)
      // Browsers revalidate through the publication check; internal CDN cache uses immutable build versions.
      metadata.set("Cache-Control", "no-cache")
      if (request.headers.get("If-None-Match") === metadata.get("ETag")) {
        await response.body?.cancel()
        return new Response(null, { status: 304, headers: metadata })
      }
      if (request.method === "HEAD") {
        await response.body?.cancel()
        return new Response(null, { headers: metadata })
      }
      return new Response(response.body, { headers: metadata })
    } catch {
      console.error(JSON.stringify({ message: "Preview asset request failed" }))
      return new Response(null, { status: 502, headers })
    }
  }
} satisfies ExportedHandler<Cloudflare.Env>
