import { defineConfig } from "@buildkitgg/dev-domains"
import { localAppEnvironment } from "./scripts/dev-environment"

const env = localAppEnvironment("{origin}")

export default defineConfig({
  project: "copacker",
  domain: "copacker.ai",
  packageManager: "pnpm",
  proxy: { https: true, port: 443, syncHosts: false },
  endpoints: {
    app: {
      primaryName: "local",
      name: "{worktree}.local",
      command: ["next", "dev"],
      framework: "next",
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
      command: ["next", process.env.E2E_DEV ? "dev" : "start"],
      framework: "next",
      env: { ...env, COPACKER_E2E_BUILD: "1" },
      auth: ["/callback"]
    }
  }
})
