import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { workerStyles } from "../../scripts/vite-vanilla-extract.ts"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Let the Worker own OPTIONS and origin policy instead of Vite's automatic preflight response.
  server: { cors: false },
  preview: { cors: false },
  ssr: { target: "webworker" },
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  plugins: [
    workerStyles(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      experimental: { newConfig: { cfBuildOutput: true } },
      persistState: { path: fileURLToPath(new URL("./.cloudflare/state", import.meta.url)) },
      inspectorPort: false,
      remoteBindings: false
    }),
    tanstackStart({ importProtection: { behavior: "error" } }),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ]
})
