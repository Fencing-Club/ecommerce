import { existsSync, globSync, readFileSync } from "node:fs"
import { posix } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const app = fileURLToPath(new URL("..", import.meta.url))

// Components with nothing to show, which have no stories: providers and contexts, and effects that render nothing.
const withoutStories = new Set([
  "src/components/access.tsx",
  "src/components/app-providers.tsx",
  "src/components/providers.tsx",
  "src/components/refresh-while.tsx",
  "src/components/reload-when-back.tsx",
  "src/components/system-time-zone.tsx",
  "src/components/theme-provider.tsx",
  "src/components/workspace-watch.tsx"
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

const sources = globSync("src/**/*.{ts,tsx}", { cwd: app }).map((file) => file.replaceAll("\\", "/"))
const isStoryOnly = (file: string) => file.endsWith(".stories.tsx") || file.startsWith("src/stories/")
const read = (file: string) => readFileSync(`${app}${file}`, "utf8")

function resolveImport(from: string, specifier: string) {
  if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
    return undefined
  }
  const base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : posix.join(posix.dirname(from), specifier)
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((file) =>
    sources.includes(file)
  )
}

const imports = new Map(
  sources.map((file) => [
    file,
    [...read(file).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
      .map((match) => resolveImport(file, match[1]!))
      .filter((target) => target !== undefined)
  ])
)

// Every component the app's routes, server and libraries reach, following imports transitively.
const reached = new Set<string>()
const pending = sources.filter((file) => !isStoryOnly(file) && !file.startsWith("src/components/"))
for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
  if (!reached.has(file)) {
    reached.add(file)
    pending.push(...(imports.get(file) ?? []))
  }
}

// The sidebar has five sections: Foundations (the ui primitives), Components (grouped by product area), Pages (the
// real routes), Prototypes (designs built only in Storybook) and Unused (components no app code renders yet).
describe("story titles", () => {
  const stories = sources
    .filter((file) => file.endsWith(".stories.tsx"))
    .map((file) => ({ file, title: read(file).match(/\.meta\(\{[\s\S]*?\btitle: "([^"]+)"/)?.[1] }))
  const sections = ["Foundations", "Components", "Pages", "Prototypes", "Unused"]

  it.each(stories)("$file is titled within a section", ({ title }) => {
    expect(sections).toContain(title?.split("/")[0])
  })

  it.each(stories.filter(({ file }) => file.startsWith("src/components/ui/")))("$file is a foundation", ({ title }) => {
    expect(title).toMatch(/^Foundations\//)
  })

  // A page story renders the route itself, with fixtures, so a change to the page changes the story.
  it.each(stories.filter(({ title }) => title?.startsWith("Pages/")))("$file renders the real page", ({ file }) => {
    expect(file).toMatch(/^src\/app\//)
    const storyModules = (imports.get(file) ?? []).filter((target) => target.startsWith("src/stories/"))
    expect(
      storyModules.filter((target) => !/^src\/stories\/(fixtures\/|server|workspace|shipping-documents)/.test(target))
    ).toEqual([])
  })

  // Wiring a component into the app, or dropping its last use, moves its stories between Components and Unused.
  it.each(stories.filter(({ file }) => file.startsWith("src/components/") && !file.startsWith("src/components/ui/")))(
    "$file is in Unused only while no app code renders it",
    ({ file, title }) => {
      const source = file.replace(/(\.\w+)?\.stories\.tsx$/, ".tsx")
      expect(title?.startsWith("Unused/")).toBe(!reached.has(source))
    }
  )
})
