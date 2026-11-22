import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

let nextId = 1;
// Shopify's swatch color gives its red, green and blue; a value without a swatch falls back to its name.
const value = (name, { available = true, selected = false, color } = {}) => ({
  id: nextId++,
  name,
  available,
  selected,
  swatch: color ? { color: { rgb: [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)).join(' ') } } : null,
});

const sizes = () => ({
  name: 'Size',
  position: 1,
  values: [value('S'), value('M', { selected: true }), value('L'), value('XL', { available: false })],
});

/**
 * `snippets/ui-variant-picker.liquid`: one product option as a group of choices under a legend that names the chosen
 * value, taking a Shopify product_option. Text options render choices and color options swatches. A sold-out value
 * stays selectable, muted and struck through. Quick view and quick add use the compact size.
 */
export default {
  title: 'Inputs/Variant picker',
  render: snippet('ui-variant-picker'),
  args: { option: sizes() },
};

export const TextOptions = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('group', { name: 'Size M' })).toBeVisible();
    const medium = canvas.getByRole('radio', { name: 'M' });
    await expect(medium).toBeChecked();
    await expect(medium).toHaveAttribute('name', 'options[Size]');
    // Sold out stays selectable, so shoppers can ask to hear when it's back.
    await expect(canvas.getByRole('radio', { name: /^XL\s*, sold out$/ })).toBeEnabled();
    await userEvent.click(canvas.getByRole('radio', { name: 'L' }));
    await expect(canvas.getByRole('radio', { name: 'L' })).toBeChecked();
  },
};

export const Unpicked = {
  args: { unpicked: true, size_guide_url: '#size-guide' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Size Choose a size' })).toBeVisible();
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).not.toBeChecked();
    await expect(canvas.getByRole('link', { name: 'Size guide' })).toHaveAttribute('href', '#size-guide');
  },
};

export const Hand = {
  args: {
    option: { name: 'Hand Orientation', position: 2, values: [value('Right', { selected: true }), value('Left')] },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Hand Right-handed' })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Left-handed' })).not.toBeChecked();
  },
};

export const Compact = {
  args: { compact: true, unpicked: true, size_guide_url: '#size-guide' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('group', { name: 'Size Choose a size' })).toBeVisible();
    await userEvent.click(canvas.getByRole('radio', { name: 'S' }));
    await expect(canvas.getByRole('radio', { name: 'S' })).toBeChecked();
  },
};

/** Long values, such as shoe sizes in US and cm, sit in rows that fill the width. */
export const LongValues = {
  args: {
    compact: true,
    option: {
      name: 'Size',
      position: 1,
      values: [
        value('Mens 8.0(US) | Womens 9.5(US) (26.0 CM)', { selected: true }),
        value('Mens 8.5(US) | Womens 10.0(US) (26.5 CM)'),
        value('Mens 9.0(US) | Womens 10.5(US) (27.0 CM)', { available: false }),
        value('Mens 11.5(US) (29.5 CM)'),
      ],
    },
  },
  decorators: [(story) => `<div style="max-width: 44rem">${story()}</div>`],
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('radio', { name: 'Mens 8.0(US) | Womens 9.5(US) (26.0 CM)' })).toBeChecked();
    await expect(canvas.getByRole('radio', { name: /^Mens 9\.0\(US\) \| Womens 10\.5\(US\) \(27\.0 CM\)\s*, sold out$/ })).toBeEnabled();
  },
};

export const Swatches = {
  args: {
    style: 'swatch',
    option: {
      name: 'Color',
      position: 2,
      values: [
        value('Black', { selected: true, color: '#101012' }),
        value('White', { color: '#ffffff' }),
        value('Navy', { available: false, color: '#1e2a4a' }),
      ],
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('group', { name: 'Color Black' })).toBeVisible();
    await expect(canvas.getByRole('radio', { name: 'Navy' })).toBeEnabled();
    const white = canvas.getByRole('radio', { name: 'White' });
    await userEvent.click(white);
    await expect(white).toBeChecked();
  },
};
