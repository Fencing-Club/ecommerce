// Storybook renders the theme's Liquid in the browser through liquidjs (stories/liquid.js). Stories live in stories/,
// not beside the Liquid, because Shopify only accepts Liquid and JSON in the theme's own folders.
/** @type {import('@storybook/html-vite').StorybookConfig} */
export default {
  stories: ['../stories/**/*.stories.js'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y'],
  framework: '@storybook/html-vite',
  core: { disableTelemetry: true },
  // The theme's CSS, scripts and images, which asset_url points at. Not /assets/: Vite serves the SVGs that
  // stories/liquid.js inlines from that path.
  staticDirs: [
    { from: '../assets', to: '/theme-assets' },
    { from: '../tests/component-library/fonts', to: '/fonts' },
  ],
};
