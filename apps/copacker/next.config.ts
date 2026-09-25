import type { NextConfig } from "next"
const config: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@repo/aisle"],
  serverExternalPackages: ["pg", "pdfjs-dist", "yauzl"],
  experimental: { serverActions: { bodySizeLimit: "34mb" } }
}
export default config
