import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import type { PluginOption } from "vite"

// vanilla-extract evaluates styles in its own Node compiler. Its Node externals must not also be applied to the
// deployed Worker. Keep other externals visible so Cloudflare still rejects unsupported runtime dependencies.
// https://github.com/cloudflare/workers-sdk/issues/10287
export function workerStyles(): PluginOption[] {
  const compilerModules = new Set([
    "@vanilla-extract/css",
    "@vanilla-extract/css/fileScope",
    "@vanilla-extract/css/adapter"
  ])
  return [
    vanillaExtractPlugin(),
    {
      name: "copacker-worker-styles",
      configResolved(config) {
        const worker = config.environments.ssr
        if (worker && Array.isArray(worker.resolve.external)) {
          worker.resolve.external = worker.resolve.external.filter((specifier) => !compilerModules.has(specifier))
        }
      }
    }
  ]
}
