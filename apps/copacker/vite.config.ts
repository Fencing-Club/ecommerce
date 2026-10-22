import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import babel from "@rolldown/plugin-babel"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { tesseract } from "./scripts/vite-tesseract.ts"
import { workerStyles } from "./scripts/vite-vanilla-extract.ts"

const appRoot = fileURLToPath(new URL(".", import.meta.url))
export default defineConfig(({ mode }) => ({
  root: mode === "e2e" ? fileURLToPath(new URL("./e2e/runtime", import.meta.url)) : appRoot,
  envDir: appRoot,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  css: { postcss: appRoot },
  server: {
    cors: false,
    allowedHosts: [".local.copacker.ai"],
    watch: { ignored: ["**/e2e/.results/**", "**/e2e/.auth/**", "**/.cloudflare/**"] }
  },
  preview: { cors: false },
  // Match package browser-field mappings to Cloudflare's workerd/browser export conditions. Node's default SSR
  // target mixes AWS's Node runtimeConfig with browser-only exports and fails when an EventBridge client is created.
  ssr: { target: "webworker" },
  environments: {
    client: {
      // Shared tiny chunks otherwise generate hundreds of requests per portal document, exhausting Windows
      // loopback sockets in sustained tests. Merge small chunks while retaining lazy page boundaries.
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              minSize: 30_000,
              groups: [
                { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 20 },
                { name: "charts", test: /node_modules[\\/](recharts|d3-[^/\\]+)[\\/]/, priority: 20 },
                // Every other package goes in the vendor chunk, with Vite's helper for lazy imports, except those the
                // app imports only when it needs them: pdf.js and zxing to read PDFs and barcodes, and Tesseract to
                // read a picture's text. Each of those keeps a chunk of its own that loads with that import.
                {
                  name: "vendor",
                  test: /node_modules[\\/](?!(?:pdfjs-dist|zxing-wasm|tesseract\.js|regenerator-runtime)[\\/])|vite[\\/]preload-helper/,
                  priority: 10
                }
              ]
            }
          }
        }
      }
    },
    ssr: {
      optimizeDeps: {
        include: ["react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime"]
      }
    }
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    workerStyles(),
    tesseract(),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      experimental: { newConfig: { cfBuildOutput: true } },
      persistState: {
        path: fileURLToPath(new URL(`./.cloudflare/state/${mode === "e2e" ? "e2e" : "development"}`, import.meta.url))
      },
      inspectorPort: false,
      remoteBindings: false
    }),
    tanstackStart({ srcDirectory: mode === "e2e" ? "../../src" : "src", importProtection: { behavior: "error" } }),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ]
}))
