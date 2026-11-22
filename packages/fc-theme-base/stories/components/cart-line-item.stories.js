import { expect } from 'storybook/test';
import { image } from '../fixtures.js';
import { snippet } from '../liquid.js';

// A Shopify cart line item, with the fields cart-line-item.liquid reads.
const line = ({ title, options = [], price, compareAt = null, quantity = 1, picture, available = true, stock = null, components = [] }) => ({
  key: `${title}:key`,
  quantity,
  url: '#product',
  url_to_remove: '#remove',
  properties: {},
  product: { title, has_only_default_variant: options.length === 0 },
  variant: {
    id: 1,
    available,
    price,
    compare_at_price: compareAt,
    quantity_price_breaks: [],
    quantity_rule: { min: 1, increment: 1, max: null },
    inventory_management: stock === null ? null : 'shopify',
    inventory_policy: 'deny',
    inventory_quantity: stock,
  },
  image: image(picture, ''),
  options_with_values: options.map(([name, value]) => ({ name, value })),
  original_line_price: price * quantity,
  final_line_price: price * quantity,
  item_components: components,
  instructions: { can_update_quantity: true, can_remove: true },
});
const component = (title, variant, quantity = 1) => ({ quantity, product: { title, has_only_default_variant: !variant }, variant: { title: variant || 'Default Title' } });

/** `snippets/cart-line-item.liquid`: one product row in the cart flyout and on the cart page. */
export default {
  title: 'Components/Cart line item',
  render: (args) =>
    `<ul class="fc-lines" role="list" style="max-width: 56rem">${snippet('cart-line-item', { stylesheets: ['cart-experience.css'] })(args)}</ul>`,
  args: {
    context: 'drawer',
    item: line({ title: 'Competition jacket 350N', options: [['Cut', 'Mens'], ['Size', '44']], price: 18995, compareAt: 21995, picture: 'collection-fie-800n-jacket.jpg' }),
  },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: 'Competition jacket 350N' })).toHaveAttribute('href', '#product');
    await expect(canvas.getByText('Mens, 44')).toBeVisible();
    await expect(canvas.getByText('$219.95')).toBeVisible();
    await expect(canvas.getByText('$189.95')).toBeVisible();
    await expect(canvas.getByRole('spinbutton', { name: 'Quantity for Competition jacket 350N' })).toHaveValue(1);
    await expect(canvas.getByRole('link', { name: 'Remove Competition jacket 350N' })).toHaveAttribute('href', '#remove');
  },
};

export const Kit = {
  args: {
    item: line({
      title: 'Club starter kit',
      price: 32900,
      picture: 'mega-club-kids.jpg',
      components: [component('Foil', 'French grip, size 5'), component('Mask', 'M'), component('Glove', 'M'), component('Fencing socks', 'M', 2)],
    }),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText('4 included items'));
    await expect(canvas.getByText('2 × Fencing socks')).toBeVisible();
    await expect(canvas.getByText('French grip, size 5')).toBeVisible();
  },
};

export const StockLimit = {
  args: { item: line({ title: 'Grip fencing glove', options: [['Size', 'M']], price: 3495, quantity: 2, stock: 2, picture: 'collection-grip-fencing-glove.jpg' }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Only 2 in stock.');
    await expect(canvas.getByRole('spinbutton', { name: 'Quantity for Grip fencing glove' })).toHaveAttribute('max', '2');
  },
};

export const Unavailable = {
  args: {
    item: line({ title: 'Underarm protector 800N', options: [['Side', 'Right'], ['Size', 'M']], price: 4995, available: false, picture: 'collection-underarm-plastron-800n.jpg' }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No longer available')).toBeVisible();
    await expect(canvas.getByText('Remove it to check out.')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Remove Underarm protector 800N' })).toBeVisible();
    await expect(canvas.queryByRole('spinbutton')).toBeNull();
  },
};
