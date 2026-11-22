import { expect } from 'storybook/test';
import { section } from '../../liquid.js';

/**
 * `sections/page-breadcrumbs.liquid`: the breadcrumb band under the header, on the page gutter, with an optional
 * parent page between Home and the current page.
 */
export default {
  title: 'Sections/Page/Breadcrumbs',
  parameters: { layout: 'fullscreen' },
  render: (args) => section('page-breadcrumbs', { variables: { page: { title: 'FAQ' }, routes: { root_url: '/' } } })(args),
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    await expect(canvas.getByText('FAQ')).toHaveAttribute('aria-current', 'page');
  },
};

export const WithParent = {
  args: { parent_page: { title: 'Size charts', url: '/pages/size-charts' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Size charts' })).toHaveAttribute('href', '/pages/size-charts');
    await expect(canvas.getByText('FAQ')).toHaveAttribute('aria-current', 'page');
  },
};
