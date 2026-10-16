import { createFileRoute } from "@tanstack/react-router"
import robots from "@/server/robots"

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const { rules, sitemap } = robots()
        const lines =
          process.env.DEPLOYMENT_ENV === "production"
            ? [
                `User-agent: ${rules.userAgent}`,
                `Allow: ${rules.allow}`,
                ...rules.disallow.map((path) => `Disallow: ${path}`),
                `Sitemap: ${sitemap}`
              ]
            : ["User-agent: *", "Disallow: /"]
        return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } })
      }
    }
  }
})
