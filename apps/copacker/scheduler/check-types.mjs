import { execSync } from "node:child_process"

// Types have the same shape in both environments. Generate against staging without choosing a deploy target.
const env = { ...process.env, COPACKER_ENVIRONMENT: "staging" }
execSync("pnpm exec cf workers types", { env, stdio: "inherit" })
execSync("pnpm exec tsc --noEmit", { env, stdio: "inherit" })
