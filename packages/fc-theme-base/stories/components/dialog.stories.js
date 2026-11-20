import { expect, waitFor } from 'storybook/test';
import { loadScript, renderLiquid, snippet } from '../liquid.js';

const trigger = renderLiquid('ui-button', {
  label: 'Size guide',
  variant: 'outline',
  additional_props: 'data-dialog-open aria-haspopup="dialog" aria-expanded="false" aria-controls="StoryDialog"',
});

/** `snippets/ui-dialog.liquid`: a centred modal with a title, close button, body and optional footer. */
export default {
  title: 'Components/Dialog',
  loaders: [loadScript('ui-dialog.js')],
  render: snippet('ui-dialog'),
  args: {
    id: 'StoryDialog',
    title: 'Glove sizes',
    description: 'Measure around your hand below the knuckles.',
    trigger,
    content: '<p>Small fits 7 to 7.5 inches. Medium fits 8 to 8.5 inches.</p>',
  },
};

const open = async (canvas, userEvent) => {
  await userEvent.click(canvas.getByRole('button', { name: 'Size guide' }));
  await waitFor(() => expect(canvas.getByRole('dialog', { name: 'Glove sizes' })).toBeVisible());
};

export const Default = {
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent);
    await expect(canvas.getByRole('dialog', { name: 'Glove sizes' })).toHaveAccessibleDescription(
      'Measure around your hand below the knuckles.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Glove sizes' })).toBeNull());
    await expect(canvas.getByRole('button', { name: 'Size guide' })).toHaveFocus();
  },
};

export const WithFooter = {
  args: {
    footer: `<a class="ui-link" href="#">Full size chart</a>${renderLiquid('ui-button', {
      label: 'Done',
      variant: 'primary',
      additional_props: 'data-dialog-close',
    })}`,
  },
  play: async ({ canvas, userEvent }) => {
    await open(canvas, userEvent);
    await expect(canvas.getByRole('link', { name: 'Full size chart' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Glove sizes' })).toBeNull());
  },
};
