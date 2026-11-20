import { expect, waitFor } from 'storybook/test';
import { loadScript, renderLiquid, snippet } from '../liquid.js';

const trigger = renderLiquid('ui-button', {
  label: 'Open drawer',
  variant: 'secondary',
  additional_props: 'data-drawer-open aria-haspopup="dialog" aria-expanded="false" aria-controls="StoryDrawer"',
});

/**
 * `snippets/ui-drawer.liquid`: the shell the cart, filters, size chart and mobile menu use: title, close, scrolling
 * body and an optional pinned footer.
 */
export default {
  title: 'Components/Drawer',
  loaders: [loadScript('ui-drawer.js')],
  render: snippet('ui-drawer'),
  args: {
    id: 'StoryDrawer',
    title: 'Filters',
    close_label: 'Close filters',
    trigger,
    content: '<p>Drawer content scrolls here.</p>',
  },
};

const open = async (canvas, userEvent) => {
  await userEvent.click(canvas.getByRole('button', { name: 'Open drawer' }));
  await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Filters' })).toBeVisible());
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent);
    await userEvent.click(canvas.getByRole('button', { name: 'Close filters' }));
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Filters' })).toBeNull());
  },
};

export const WithFooter = {
  args: {
    description: '24 products',
    footer: renderLiquid('ui-button', { label: 'Show results', variant: 'primary', full_width: true }),
  },
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent);
    await expect(canvas.getByRole('button', { name: 'Show results' })).toBeVisible();
  },
};
