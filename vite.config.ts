import oxlintBase from "@repo/oxlint-config/base" with { type: "json" }
import { defineConfig } from "vite-plus"

// Lint and format policy for the whole monorepo. Vite+ ignores nested configs, so package-specific settings go here
// as ignore patterns or overrides. The shared lint rules stay in @repo/oxlint-config.
export default defineConfig({
  lint: {
    ...oxlintBase,
    ignorePatterns: [
      ...oxlintBase.ignorePatterns,
      "packages/fc-theme/**",
      "packages/fc-theme-base/**",
      "apps/copacker/.next/**",
      "apps/copacker/next-env.d.ts",
      "apps/copacker/drizzle/meta/**",
      "apps/copacker/.storybook/public/**",
      "**/routeTree.gen.ts",
      "**/.cloudflare/**"
    ]
  },
  fmt: {
    printWidth: 120,
    semi: false,
    trailingComma: "none",
    proseWrap: "always",
    sortImports: {
      enabled: true,
      newlinesBetween: false,
      sortSpecifiers: true
    },
    sortPackageJson: false,
    ignorePatterns: [
      "**/dist/**",
      "**/storybook-static/**",
      "**/coverage/**",
      "**/docs/**",
      "**/drizzle/migrations/meta/**",
      "**/.trigger/**",
      "**/.data/**",
      "**/.fixtures/**",
      "**/next-env.d.ts",
      "**/*.shopify*.html",
      ".vscode/mcp.json",
      "pnpm-lock.yaml",
      ".agents/**",
      ".claude/skills/**",
      "best-practices/**",
      "AGENTS.md",
      "CLAUDE.md",
      ".github/copilot-instructions.md",
      "packages/fc-theme/**",
      "packages/fc-theme-base/**",
      "**/.next/**",
      "**/.cloudflare/**",
      "**/.wrangler/**",
      "**/routeTree.gen.ts",
      "**/mockServiceWorker.js"
    ]
  },
  // vp staged (lint-staged) passes the matched files, splits long lists into chunks and restages whatever the fixes
  // change. vp runs through node, not the vp.cmd shim: the shim goes through cmd.exe, whose 8191-character limit a
  // chunk of long paths overflows on large commits.
  staged: {
    "*.{js,jsx,ts,tsx,json,css,scss,yaml,yml,md}":
      "node node_modules/vite-plus/bin/vp check --fix --no-error-on-unmatched-pattern",
    // Theme Check reads the whole theme, so it runs once without file arguments.
    "packages/fc-theme-base/**/*.{liquid,json}": () => "pnpm --filter @repo/fc-theme-base lint"
  }
})
