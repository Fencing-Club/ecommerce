import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { maintenanceHeader } from "./src/lib/maintenance"

// Next 16 builds with Turbopack; "auto" registers vanilla-extract's Turbopack loader for *.css.ts files.
const withVanillaExtract = createVanillaExtractPlugin({ unstable_turbopack: { mode: "auto" } })
// Every page and route reads its language and messages from src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const config: NextConfig = {
  ...(process.env.COPACKER_E2E_BUILD === "1" && { distDir: ".next-e2e" }),
  ...(process.env.COPACKER_LOCAL === "1" &&
    process.env.APP_URL && {
      allowedDevOrigins: [new URL(process.env.APP_URL).hostname]
    }),
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@repo/aisle", "@repo/copacker-emails"],
  serverExternalPackages: ["pg", "pdfjs-dist", "yauzl"],
  // authInterrupts turns on forbidden(), which shows a member the No access page for a page they weren't given.
  experimental: { serverActions: { bodySizeLimit: "34mb" }, authInterrupts: true },
  // The page a request the proxy marks for maintenance shows. A rewrite here stays inside the app, where one from the
  // proxy is treated as another site's address when the server's hostname is 127.0.0.1, as in development.
  rewrites: async () => ({
    beforeFiles: [
      { source: "/:path*", has: [{ type: "header", key: maintenanceHeader }], destination: "/maintenance" }
    ],
    afterFiles: [],
    fallback: []
  })
}

export default withNextIntl(withVanillaExtract(config))
