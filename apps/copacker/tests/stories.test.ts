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
  "src/components/theme-script.tsx",
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

// `import type { A }` and `import { type A, type B }` load nothing.
function typeOnly(clause: string) {
  if (/^type\s/.test(clause)) {
    return true
  }
  const names = clause
    .trim()
    .match(/^\{([^}]*)\}$/)?.[1]
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  return names !== undefined && names.length > 0 && names.every((name) => name.startsWith("type "))
}

// The modules a file loads when it runs: static imports and re-exports, side-effect imports and dynamic imports.
// Comments and type-only imports load nothing, so they don't count.
function runtimeImports(text: string) {
  const code = text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|[^:"'`])\/\/.*$/gm, "$1")
  return [
    ...[...code.matchAll(/\b(?:import|export)\s+([^;"'`]*?)\s+from\s*["']([^"']+)["']/g)]
      .filter((match) => !typeOnly(match[1]!))
      .map((match) => match[2]!),
    ...[...code.matchAll(/\bimport\s*["']([^"']+)["']/g)].map((match) => match[1]!),
    ...[...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]!)
  ]
}

const imports = new Map(
  sources.map((file) => [
    file,
    runtimeImports(read(file))
      .map((specifier) => resolveImport(file, specifier))
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

// The sidebar has six sections: Foundations (the ui primitives), Components (grouped by product area), Pages (the
// real routes), Prototypes (designs built only in Storybook), Simulators (the real rules and documents, run on sample
// data) and Unused (components no app code renders yet).
describe("story titles", () => {
  const stories = sources
    .filter((file) => file.endsWith(".stories.tsx"))
    .map((file) => ({ file, title: read(file).match(/\.meta\(\{[\s\S]*?\btitle: "([^"]+)"/)?.[1] }))
  const sections = ["Foundations", "Components", "Pages", "Prototypes", "Simulators", "Unused"]

  it.each(stories)("$file is titled within a section", ({ title }) => {
    expect(sections).toContain(title?.split("/")[0])
  })

  it.each(stories.filter(({ file }) => file.startsWith("src/components/ui/")))("$file is a foundation", ({ title }) => {
    expect(title).toMatch(/^Foundations\//)
  })

  // A simulator lives in src/stories/simulators, and only there.
  it.each(stories)("$file is a simulator exactly when it's in src/stories/simulators", ({ file, title }) => {
    expect(title?.startsWith("Simulators/")).toBe(file.startsWith("src/stories/simulators/"))
  })

  // Simulators are for trying things by hand: each carries the "simulator" tag, which test runs leave out.
  it.each(stories.filter(({ file }) => file.startsWith("src/stories/simulators/")))(
    "$file is left out of test runs",
    ({ file }) => {
      expect(read(file).match(/\.meta\(\{[\s\S]*?\btags: \[([^\]]*)\]/)?.[1]).toContain('"simulator"')
    }
  )

  // Every story beside a route is that route's page story, except designs not yet built into it. The order and shipment
  // list designs are now the pages themselves, so none are waiting.
  const routePrototypes = new Set<string>()
  it.each(stories.filter(({ file }) => file.startsWith("src/app/")))(
    "$file is a page or a listed prototype",
    ({ file, title }) => {
      expect(title).toMatch(routePrototypes.has(file) ? /^Prototypes\// : /^Pages\//)
    }
  )

  it.each([...routePrototypes])("%s, listed as a route prototype, exists", (file) => {
    expect(existsSync(`${app}${file}`)).toBe(true)
  })

  // A page story renders the route itself, with fixtures, so a change to the page changes the story. Its play function
  // may use the shared play helpers and action recorder.
  it.each(stories.filter(({ title }) => title?.startsWith("Pages/")))("$file renders the real page", ({ file }) => {
    expect(file).toMatch(/^src\/app\//)
    const storyModules = (imports.get(file) ?? []).filter((target) => target.startsWith("src/stories/"))
    expect(
      storyModules.filter(
        (target) => !/^src\/stories\/(fixtures\/|server|workspace|shipping-documents|play|actions)/.test(target)
      )
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
