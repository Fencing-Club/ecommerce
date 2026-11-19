import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-breadcrumbs.liquid`: the trail from Home to the current page. */
export default {
  title: 'Components/Breadcrumbs',
  render: snippet('ui-breadcrumbs'),
  args: { root_label: 'Home', root_url: '/', current_label: 'Shipping policy' },
};

export const Default = {
  play: async ({ canvas }) => {
    const trail = canvas.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await expect(canvas.getByText('Shipping policy')).toHaveAttribute('aria-current', 'page');
  },
};

export const WithParent = {
  args: { parent_label: 'Clothing', parent_url: '#clothing', current_label: 'Jackets' },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('link')).toHaveLength(2);
    await expect(canvas.getByRole('link', { name: 'Clothing' })).toHaveAttribute('href', '#clothing');
  },
};
