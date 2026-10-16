import { createFileRoute } from "@tanstack/react-router"
import sitemap from "@/server/sitemap"

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap()
            .map(
              ({ url }) =>
                `<url><loc>${url.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;")}</loc></url>`
            )
            .join("")}</urlset>`,
          { headers: { "Content-Type": "application/xml; charset=utf-8" } }
        )
    }
  }
})
