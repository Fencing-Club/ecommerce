import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

// Next 16 builds with Turbopack; "auto" registers vanilla-extract's Turbopack loader for *.css.ts files.
const withVanillaExtract = createVanillaExtractPlugin({ unstable_turbopack: { mode: "auto" } })
// Every page and route reads its language and messages from src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const config: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@repo/aisle", "@repo/copacker-emails"],
  serverExternalPackages: ["pg", "pdfjs-dist", "yauzl"],
  // authInterrupts turns on forbidden(), which shows a member the No access page for a page they weren't given.
  experimental: { serverActions: { bodySizeLimit: "34mb" }, authInterrupts: true }
}

export default withNextIntl(withVanillaExtract(config))
