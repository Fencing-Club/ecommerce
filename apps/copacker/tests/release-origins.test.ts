import { describe, expect, it } from "vitest"
import { releaseOrigins } from "../scripts/release-origins"

const destinations = { APP_URL: "https://app.example", STORIES_URL: "https://stories.example" }

describe("release destinations", () => {
  it("normalizes HTTPS origins for health and callback checks", () => {
    expect(releaseOrigins({ ...destinations, APP_URL: "https://app.example/" }, "staging")).toEqual(destinations)
  })
  it.each([
    undefined,
    "http://app.example",
    "https://user:password@app.example",
    "https://app.example/portal",
    "https://app.example?test=1",
    "https://app.example#section"
  ])("rejects an invalid or absent destination %s", (value) => {
    expect(() => releaseOrigins({ ...destinations, APP_URL: value }, "staging")).toThrow(/Invalid|Release URLs/)
    expect(() => releaseOrigins({ ...destinations, STORIES_URL: value }, "staging")).toThrow(/Invalid|Release URLs/)
  })
  it("rejects shared web and Storybook origins", () => {
    expect(() => releaseOrigins({ ...destinations, STORIES_URL: destinations.APP_URL }, "staging")).toThrow(
      "separate origins"
    )
  })
  it("requires each production hostname on the matching Worker before any deployment", () => {
    expect(() => releaseOrigins(destinations, "production")).toThrow("Worker domains")
    expect(() =>
      releaseOrigins(
        { ...destinations, CLOUDFLARE_DOMAINS: "stories.example", CLOUDFLARE_STORIES_DOMAINS: "app.example" },
        "production"
      )
    ).toThrow("Worker domains")
    expect(
      releaseOrigins(
        {
          ...destinations,
          CLOUDFLARE_DOMAINS: "other.example, app.example",
          CLOUDFLARE_STORIES_DOMAINS: "stories.example"
        },
        "production"
      )
    ).toEqual(destinations)
  })
})
