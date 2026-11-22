import { expect, within } from 'storybook/test';
import { cardProducts, products } from '../fixtures.js';
import { snippet } from '../liquid.js';

/**
 * `snippets/ui-product-card.liquid`: the one product card for the homepage, collections, search and the product
 * page's recommendations. The protection level sits top left, Sale or Sold out top right and another brand's logo
 * bottom left. Hovering shows arrows and a progress bar over the photos; touch screens swipe and get quick add.
 */
export default {
  title: 'Components/Product card',
  render: (args) => `<div style="max-width: 23rem">${snippet('ui-product-card')(args)}</div>`,
  args: { product: cardProducts.sale, card_id: 'card-811', show_price: true },
};

export const Default = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'FIE 800N Competition Jacket' })).toBeVisible();
    for (const link of canvas.getAllByRole('link', { name: 'FIE 800N Competition Jacket' })) {
      await expect(link).toHaveAttribute('href', '#product-811');
    }
    await expect(canvas.getByText('800N FIE')).toBeVisible();
    await expect(canvas.getByText('20% off')).toBeVisible();
    await expect(canvas.getByText('$239.20')).toBeVisible();
    await expect(canvas.getByText('$299')).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'FWF' })).toBeVisible();
    await expect(canvas.getByText('5 colors: White, Black, Navy, Red, Blue')).toBeInTheDocument();
    await expect(canvas.getByText('+2')).toBeVisible();
  },
};

export const PhotoCarousel = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const segments = canvasElement.querySelectorAll('.ui-product-card__segment');
    await expect(segments).toHaveLength(4);
    await expect(segments[0]).toHaveAttribute('data-current');

    await userEvent.hover(canvas.getAllByRole('link', { name: 'FIE 800N Competition Jacket' })[0]);
    await userEvent.click(canvas.getByRole('button', { name: 'Next photo' }));
    await expect(segments[1]).toHaveAttribute('data-current');
    await expect(segments[0]).not.toHaveAttribute('data-current');

    // Going back from the first photo wraps round to the last.
    await userEvent.click(canvas.getByRole('button', { name: 'Previous photo' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Previous photo' }));
    await expect(segments[3]).toHaveAttribute('data-current');
  },
};

export const OwnBrand = {
  args: { product: cardProducts.ownBrand, card_id: 'card-812' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('350N')).toBeVisible();
    await expect(canvas.getByText('$89')).toBeVisible();
    // Our own brand shows no logo, and one photo needs no arrows.
    await expect(canvas.queryByRole('img', { name: 'Fencing Club' })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();
    await expect(canvas.queryByText(/% off/)).not.toBeInTheDocument();
  },
};

export const SoldOut = {
  args: { product: cardProducts.soldOut, card_id: 'card-813', show_add: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Sold out')).toBeVisible();
    await expect(canvas.queryByText(/% off/)).not.toBeInTheDocument();
    // A sold-out card shows its price without the sale, and offers nothing to add.
    await expect(canvas.queryByText('$99.00')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
  },
};

export const QuickAdd = {
  args: { product: cardProducts.single, card_id: 'card-814', show_add: true, section_id: 'story' },
  play: async ({ canvasElement }) => {
    // Quick add shows on touch screens only, so pointer screens hide it. A single-variant product goes straight in
    // the cart.
    const add = canvasElement.querySelector('.ui-product-card__quick-add button');
    await expect(add).toHaveAttribute('type', 'submit');
    await expect(add).toHaveAttribute('aria-label', 'Add to cart');
    await expect(add).toHaveAttribute('aria-describedby', 'card-814');
  },
};

export const QuickAddWithOptions = {
  args: { show_add: true, section_id: 'story' },
  play: async ({ canvasElement }) => {
    // With sizes or colors to pick, quick add leads to them instead.
    const choose = canvasElement.querySelector('a.ui-product-card__quick-add');
    await expect(choose).toHaveAttribute('href', '#product-811');
    await expect(choose).toHaveAttribute('aria-label', 'Choose options');
    await expect(choose).toHaveAttribute('aria-describedby', 'card-811');
  },
};

export const LongName = {
  args: { product: cardProducts.longName, card_id: 'card-815' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Stretch Fencing Pants 800N FIE with Adjustable Suspenders and Reinforced Knees' }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: 'Blaise' })).toBeVisible();
  },
};

export const NoImage = {
  args: { product: { ...products[1], featured_image: null }, card_id: 'card-802' },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Fencing glove' })).toBeVisible();
  },
};

export const Search = {
  args: { variant: 'search' },
  play: async ({ canvas }) => {
    const card = canvas.getByRole('article');
    await expect(card).toHaveClass('ui-product-card--search');
    // The predictive search row shows the photo, name and price only.
    await expect(within(card).queryByText('800N FIE')).not.toBeInTheDocument();
    await expect(within(card).queryByText('20% off')).not.toBeInTheDocument();
  },
};
