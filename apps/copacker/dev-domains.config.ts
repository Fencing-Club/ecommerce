import { fileURLToPath } from "node:url"
import { defineConfig } from "@buildkitgg/dev-domains"
import { localAppEnvironment } from "./scripts/dev-environment"

const env = localAppEnvironment("{origin}")
const vite = [
  process.execPath,
  "--env-file-if-exists=.env",
  fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")))
]

export default defineConfig({
  project: "copacker",
  domain: "copacker.ai",
  packageManager: "pnpm",
  proxy: { https: true, port: 443, syncHosts: false },
  endpoints: {
    app: {
      primaryName: "local",
      name: "{worktree}.local",
      command: [...vite, "dev", "--mode", "development"],
      framework: "vite",
      env,
      auth: [
        "/callback",
        "/api/connections/shopify",
        "/api/connections/amazon",
        "/api/connections/ebay",
        "/api/connections/amazon-ads"
      ]
    },
    stories: {
      kind: "storybook",
      primaryName: "stories.local",
      name: "{worktree}.stories.local",
      command: ["storybook", "dev"],
      framework: "storybook",
      env
    },
    e2e: {
      kind: "e2e",
      primaryName: "e2e.local",
      name: "{worktree}.e2e.local",
      command: [...vite, process.env.E2E_DEV ? "dev" : "preview", "--mode", "e2e"],
      framework: "vite",
      env: { ...env, COPACKER_E2E_BUILD: "1" },
      auth: ["/callback"]
    }
  }
})
