import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-price.liquid`: a price, with the regular price struck through on sale, a badge and a unit price. */
export default {
  title: 'Elements/Price',
  render: snippet('ui-price'),
  args: { price: 4500 },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('$45.00')).toBeVisible();
    await expect(canvas.queryByText('Regular price')).toBeNull();
  },
};

export const Sale = {
  args: { price: 3600, compare_at_price: 4500, badge_label: 'Sale' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Regular price').parentElement).toHaveTextContent('Regular price$45.00');
    await expect(canvas.getByText('Sale price').parentElement).toHaveTextContent('Sale price$36.00');
    await expect(canvas.getByText('Sale', { exact: true })).toBeVisible();
  },
};

export const UnitPrice = {
  args: { price: 1200, unit_price: '$2.40/100ml' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Unit price').parentElement).toHaveTextContent('Unit price$2.40/100ml');
  },
};

export const Small = {
  args: { price: 3600, compare_at_price: 4500, size: 'sm' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sale price')).toBeInTheDocument();
  },
};
