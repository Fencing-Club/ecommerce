import { bindings, defineConfig, triggers } from "cf/config"

const environment = process.env.COPACKER_ENVIRONMENT
if (environment !== "staging" && environment !== "production") {
  throw new Error("Set COPACKER_ENVIRONMENT to staging or production")
}

export default defineConfig({
  accountId: "544b5bfd594cd02a5da4b79a2038cc9f",
  worker: {
    name: `copacker-scheduler-${environment}`,
    entrypoint: "./index.ts",
    compatibilityDate: "2026-10-15",
    env: { JOBS: bindings.queue<string>({ name: `copacker-jobs-${environment}` }) },
    triggers: [triggers.scheduled({ schedule: "17 * * * *" }), triggers.scheduled({ schedule: "0 7 * * *" })],
    observability: { enabled: true, traces: { enabled: true } }
  }
})
