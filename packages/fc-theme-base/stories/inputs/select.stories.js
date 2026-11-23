import { expect, waitFor } from 'storybook/test';
import { loadScript, snippet } from '../liquid.js';

const options = ['Featured', 'Best selling', 'Price, low to high', 'Price, high to low']
  .map((label, index) => `<option value="sort-${index}"${index === 0 ? ' selected' : ''}>${label}</option>`)
  .join('');

const nativeSelect = (canvasElement) => canvasElement.querySelector('ui-select select');

/**
 * `snippets/ui-select.liquid`: a native select that `assets/ui-select.js` turns into a styled listbox. Without
 * JavaScript the native select stays.
 */
export default {
  title: 'Inputs/Select',
  loaders: [loadScript('ui-select.js')],
  render: snippet('ui-select'),
  args: { id: 'SortBy', name: 'sort_by', label: 'Sort by', options },
};

export const Default = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const trigger = await waitFor(() => canvas.getByRole('combobox', { name: /Sort by/ }));
    await expect(trigger).toHaveTextContent('Featured');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('option', { name: 'Best selling' }));
    await expect(trigger).toHaveTextContent('Best selling');
    await expect(nativeSelect(canvasElement)).toHaveValue('sort-1');
  },
};

export const WithPrefix = {
  args: { prefix: 'Sort by', hide_label: true },
  play: async ({ canvas }) => {
    await expect(await waitFor(() => canvas.getByRole('combobox', { name: /Sort by/ }))).toBeVisible();
  },
};

export const Disabled = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(nativeSelect(canvasElement)).toBeDisabled();
  },
};
