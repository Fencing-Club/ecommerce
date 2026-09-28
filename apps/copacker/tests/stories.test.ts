import { existsSync, globSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const app = fileURLToPath(new URL("..", import.meta.url))

// Components with nothing to show, which have no stories: providers and contexts, and effects that render nothing.
const withoutStories = new Set([
  "src/components/access.tsx",
  "src/components/app-providers.tsx",
  "src/components/client-messages.tsx",
  "src/components/localization-provider.tsx",
  "src/components/providers.tsx",
  "src/components/refresh-while.tsx",
  "src/components/reload-when-back.tsx",
  "src/components/system-time-zone.tsx",
  "src/components/theme-provider.tsx",
  "src/components/workspace-watch.tsx",
  // Forwarders are listed with the other partners; the page only redirects there.
  "src/app/(portal)/forwarders/page.tsx"
])

function files(pattern: string) {
  return globSync(pattern, { cwd: app })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.endsWith(".stories.tsx"))
    .toSorted()
}

// Storybook recreates every page and component beside its source, as <name>.stories.tsx.
describe("stories", () => {
  const pages = files("src/app/**/{page,error,forbidden,not-found}.tsx").filter(
    (file) => !file.startsWith("src/app/api/")
  )
  const components = [...files("src/components/**/*.tsx"), ...files("src/app/**/*-view.tsx")]

  it.each([...pages, ...components].filter((file) => !withoutStories.has(file)))("%s has stories", (file) => {
    expect(existsSync(`${app}${file.replace(/\.tsx$/, ".stories.tsx")}`)).toBe(true)
  })

  it.each([...withoutStories])("%s, listed without stories, exists", (file) => {
    expect(existsSync(`${app}${file}`)).toBe(true)
  })
})
