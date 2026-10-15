import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { workerStyles } from "../../scripts/vite-vanilla-extract.ts"

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
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
    react({ babel: { plugins: ["babel-plugin-react-compiler"] } })
  ]
})
