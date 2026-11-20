import { expect, fn, waitFor } from 'storybook/test';
import { loadScript, snippet } from '../liquid.js';

/** `snippets/ui-notice.liquid`: a short message in a tinted box, with an optional dismiss button. */
export default {
  title: 'Elements/Notice',
  loaders: [loadScript('ui-notice.js')],
  render: snippet('ui-notice'),
  args: { title: 'Orders ship within 2 business days', body: 'Custom lettering adds 3 days.' },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Orders ship within 2 business days')).toBeVisible();
    await expect(canvas.getByText('Custom lettering adds 3 days.')).toBeVisible();
  },
};

export const Destructive = {
  args: { tone: 'destructive', role: 'alert', title: 'We couldn’t update your cart', body: 'Try again in a moment.' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('We couldn’t update your cart');
  },
};

export const Dismissible = {
  args: { dismiss_label: 'Dismiss', body: '' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const onDismiss = fn();
    canvasElement.addEventListener('notice:dismiss', onDismiss);
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(canvas.queryByText('Orders ship within 2 business days')).toBeNull());
    await expect(onDismiss).toHaveBeenCalledOnce();
  },
};
