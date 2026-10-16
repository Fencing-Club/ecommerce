import { bindings, defineConfig } from "cf/config"
import { previewAssetsHostname, previewAssetsWorker } from "../scripts/preview-config.ts"

export default defineConfig({
  worker: {
    name: previewAssetsWorker,
    entrypoint: "./index.ts",
    compatibilityDate: "2026-10-16",
    workersDev: true,
    previewUrls: false,
    domains: [previewAssetsHostname],
    observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
    env: { DOCUMENTS: bindings.r2({ name: "copacker-staging-private" }) }
  }
})
