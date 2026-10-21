import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import type { Plugin } from "vite"

// Tesseract reads the text on carrier labels that are pictures, in the browser, from this app's own copy of its files
// rather than a CDN: its worker, its WebAssembly core and its English data, served under /tesseract/ by the names it
// asks for. Nothing loads them until a picture label's preview is opened (src/lib/label-text.ts).
const require = createRequire(import.meta.url)
const files: Record<string, string> = {
  "worker.min.js": require.resolve("tesseract.js/dist/worker.min.js"),
  "tesseract-core-simd-lstm.wasm.js": require.resolve("tesseract.js-core/tesseract-core-simd-lstm.wasm.js"),
  "eng.traineddata.gz": require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz")
}

export function tesseract(): Plugin {
  return {
    name: "copacker-tesseract",
    configureServer(server) {
      server.middlewares.use("/tesseract", (request, response, next) => {
        const file = files[new URL(request.url ?? "/", "http://localhost").pathname.slice(1)]
        if (!file) {
          next()
          return
        }
        response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "application/octet-stream")
        response.end(readFileSync(file))
      })
    },
    generateBundle() {
      if (this.environment.name !== "client") {
        return
      }
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName: `tesseract/${name}`, source: readFileSync(file) })
      }
    }
  }
}
