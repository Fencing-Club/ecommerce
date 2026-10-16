import { Generator, getConfig } from "@tanstack/router-generator"

const root = process.cwd()
await new Generator({
  config: getConfig(
    {
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      // Match Start's Vite registration so standalone type generation preserves the same checked-in tree.
      routeTreeFileFooter: [
        `import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}`
      ]
    },
    root
  ),
  root
}).run()
