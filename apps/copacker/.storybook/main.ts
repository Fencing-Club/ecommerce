import { fileURLToPath } from "node:url"
import type { StorybookConfig } from "@storybook/nextjs-vite"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import { mergeConfig } from "vite"

const mock = (file: string) => fileURLToPath(new URL(`./mocks/${file}`, import.meta.url))
const localHost =
  process.env.COPACKER_LOCAL === "1" && process.env.APP_URL ? new URL(process.env.APP_URL).hostname : undefined

// Every page and component, each beside its source: src/app/**/page.stories.tsx for the pages, and
// src/components/**/*.stories.tsx for the components.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
  framework: { name: "@storybook/nextjs-vite", options: { nextConfigPath: "../next.config.ts" } },
  core: { disableTelemetry: true, ...(localHost && { allowedHosts: [localHost] }) },
  // The mock service worker lives with Storybook, so the app never serves it.
  staticDirs: ["../public", "./public"],
  viteFinal: (vite) => {
    const hmr = vite.server?.hmr
    return mergeConfig(vite, {
      server: {
        ...(localHost && { allowedHosts: [localHost] }),
        // Storybook supplies its HTTP server through the older HMR options. Pass it to Vite 8's WebSocket options
        // explicitly so concurrent worktrees share their own HTTP port instead of competing for Vite's default port.
        ...(typeof hmr === "object" &&
          hmr.server && {
            ws: {
              server: hmr.server,
              port: hmr.port,
              ...(localHost && { host: localHost, protocol: "wss", clientPort: 443 })
            }
          })
      },
      plugins: [vanillaExtractPlugin()],
      resolve: {
        // The server's side of what server components use: messages from the story's language, a database that
        // answers with each story's rows, and ClientMessages, which the marketing pages render inside sync components.
        alias: [
          { find: /^next-intl\/server$/, replacement: mock("next-intl-server.ts") },
          { find: /^@\/db$/, replacement: mock("db.ts") },
          { find: /^@\/components\/client-messages$/, replacement: mock("client-messages.ts") },
          // vanilla-extract compiles .css.ts files apart from the app's modules, without the tsconfig paths.
          { find: /^@\//, replacement: fileURLToPath(new URL("../src/", import.meta.url)) }
        ]
      },
      optimizeDeps: {
        include: [
          "msw",
          "msw/browser",
          "msw-storybook-addon",
          "@vanilla-extract/sprinkles/createRuntimeSprinkles",
          "nuqs",
          "nuqs/adapters/testing"
        ]
      }
    })
  }
}

export default config
