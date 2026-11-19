import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: `coverage/${process.pid}`,
      include: ['assets/policy-page.js', 'assets/size-chart.js', 'assets/ui-drawer.js'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'happy-dom', include: ['tests/**/*.test.js'] },
      },
      // Every story renders in Chromium and runs its play function and accessibility check. CI runs these in the
      // stories job, which installs the browser; `test` and `test:coverage` run only the unit project.
      {
        extends: true,
        plugins: [storybookTest({ configDir: fileURLToPath(new URL('.storybook', import.meta.url)) })],
        test: {
          name: 'storybook',
          setupFiles: ['.storybook/vitest.setup.js'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
        },
      },
    ],
  },
});
