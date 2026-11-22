import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

let nextId = 1;
const value = (name, { selected = false, available = true } = {}) => ({ id: nextId++, name, selected, available, swatch: null });

// Shopify's option order on the store: Size, then Hand Orientation, then Color.
const product = {
  options_with_values: [
    { name: 'Size', position: 1, values: ['XS', 'S', 'M', 'L', 'XL'].map((name) => value(name, { selected: name === 'M', available: name !== 'XL' })) },
    { name: 'Hand Orientation', position: 2, values: [value('Right', { selected: true }), value('Left')] },
    { name: 'Color', position: 3, values: [value('White', { selected: true }), value('Black')] },
  ],
};

/**
 * `snippets/product-option-pickers.liquid`: a product's option pickers in the order the Pen shows them, whatever
 * Shopify's order: color as swatches, then hand, then the rest. Size gets the size guide link and can start unpicked.
 * Quick view and quick add use the compact size; the product page uses the full one.
 */
export default {
  title: 'Components/Product option pickers',
  render: snippet('product-option-pickers'),
  args: { product, id_prefix: 'Story', form_id: 'StoryForm', size_guide_url: '#size-guide' },
  decorators: [(story) => `<div style="display: grid; gap: 1.8rem; max-width: 44rem">${story()}</div>`],
};

export const ProductPage = {
  play: async ({ canvas }) => {
    const names = canvas.getAllByRole('group').map((group) => group.querySelector('legend').textContent.replace(/\s+/g, ' ').trim());
    await expect(names).toEqual(['Color White', 'Hand Right-handed', 'Size M']);
    await expect(canvas.getByRole('link', { name: 'Size guide' })).toHaveAttribute('href', '#size-guide');
  },
};

export const QuickView = {
  args: { compact: true, size_unpicked: true, size_guide_controls: 'StorySizeGuide' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Size Choose a size' })).toBeVisible();
    const guide = canvas.getByRole('link', { name: 'Size guide' });
    await expect(guide).toHaveAttribute('aria-controls', 'StorySizeGuide');
    await expect(guide).toHaveAttribute('aria-expanded', 'false');
  },
};
