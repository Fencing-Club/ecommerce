import { bindings, defineConfig } from "cf/config"

// Synthetic codec probes and optional WorkOS test-account probes share a protected staging endpoint.
// Local runs always use local Postgres, even when built in staging mode.
export default defineConfig(({ mode }) => ({
  worker: {
    name: mode === "staging" ? "copacker-start-compatibility" : "copacker-start-compatibility-local",
    entrypoint: "./src/server.ts",
    workersDev: mode === "staging",
    previewUrls: false,
    compatibilityDate: "2026-10-15",
    compatibilityFlags: ["nodejs_compat"],
    observability: { enabled: true, traces: { enabled: true }, redactQueryString: true },
    env: {
      PROBE_MODE: bindings.text(mode === "staging" ? "staging" : "local"),
      PROBE_ACCESS_TOKEN: mode === "staging" ? bindings.secret() : bindings.text("local-fixture-not-a-secret"),
      HYPERDRIVE: bindings.hyperdrive({
        id: "0a74043480fe42a6acdbf46b9572ef58",
        dev: { connectionString: "postgres://copacker:copacker@127.0.0.1:54329/copacker" }
      }),
      WORKOS_CLIENT_ID: mode === "staging" ? bindings.secret() : bindings.text("client_compatibility"),
      WORKOS_API_KEY: mode === "staging" ? bindings.secret() : bindings.text("sk_test_compatibility_not_real"),
      WORKOS_COOKIE_PASSWORD:
        mode === "staging" ? bindings.secret() : bindings.text("compatibility-cookie-password-not-a-secret"),
      WORKOS_COOKIE_NAME: bindings.text("migration-session"),
      WORKOS_REDIRECT_URI: bindings.text("https://tanstack-start.e2e.local.copacker.ai/callback"),
      TOKEN_ENCRYPTION_KEY: bindings.text("Y29tcGF0aWJpbGl0eS10ZXN0LWtleS0wMDAwMDAwMDA=")
    }
  }
}))
