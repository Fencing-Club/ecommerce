import { fileURLToPath } from "node:url"
import type { StorybookConfig } from "@storybook/nextjs-vite"
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin"
import { mergeConfig } from "vite"

const mock = (file: string) => fileURLToPath(new URL(`./mocks/${file}`, import.meta.url))

// Every page and component, each beside its source: src/app/**/page.stories.tsx for the pages, and
// src/components/**/*.stories.tsx for the components.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
  framework: { name: "@storybook/nextjs-vite", options: { nextConfigPath: "../next.config.ts" } },
  core: { disableTelemetry: true },
  // The mock service worker lives with Storybook, so the app never serves it.
  staticDirs: ["../public", "./public"],
  viteFinal: (vite) =>
    mergeConfig(vite, {
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

export default config
