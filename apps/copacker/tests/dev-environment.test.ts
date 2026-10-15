import { expect, it } from "vitest"
import { localAppEnvironment } from "../scripts/dev-environment"

it("replaces stale aliases, callbacks and shared cookie domains", () => {
  const origin = "https://feature.local.copacker.ai"
  expect(localAppEnvironment(origin)).toEqual({
    APP_URL: origin,
    APP_ALIAS_URLS: "",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: `${origin}/callback`,
    WORKOS_COOKIE_DOMAIN: "",
    COPACKER_LOCAL: "1"
  })
})
