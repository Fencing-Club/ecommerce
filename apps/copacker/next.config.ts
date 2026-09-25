import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin"
import type { NextConfig } from "next"

// Next 16 builds with Turbopack; "auto" registers vanilla-extract's Turbopack loader for *.css.ts files.
const withVanillaExtract = createVanillaExtractPlugin({ unstable_turbopack: { mode: "auto" } })

const config: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@repo/aisle"],
  serverExternalPackages: ["pg", "pdfjs-dist", "yauzl"],
  experimental: { serverActions: { bodySizeLimit: "34mb" } }
}

export default withVanillaExtract(config)
