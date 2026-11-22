import { expect } from 'storybook/test';
import { renderLiquid } from '../liquid.js';

const button = (args) => renderLiquid('ui-button', { size: 'lg', ...args });

/**
 * `snippets/ui-message.liquid`: a whole-area message with an icon, a heading, a line of text and the next steps. The
 * cart shows it when it's empty or doesn't load, and quick view when the product doesn't load.
 */
export default {
  title: 'Elements/Message',
  render: ({ primary, secondary, ...args }) => {
    const actions = [primary && button({ variant: 'primary', ...primary }), secondary && button({ variant: 'outline', ...secondary })].filter(Boolean).join('');
    return `<div style="padding: 4.8rem 1.6rem">${renderLiquid('ui-message', { ...args, actions })}</div>`;
  },
  args: {
    icon: 'cloud-alert',
    title: "We couldn't load this product",
    body: "Your connection or our store didn't respond.",
    primary: { label: 'Try again', icon: 'rotate-ccw' },
    secondary: { label: 'View full details', url: '/products/novus-jacket' },
  },
};

export const Failed = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: "We couldn't load this product" })).toBeVisible();
    await expect(canvas.getByText("Your connection or our store didn't respond.")).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'View full details' })).toHaveAttribute('href', '/products/novus-jacket');
  },
};

export const Empty = {
  args: {
    icon: 'shopping-bag',
    title: 'Your cart is empty',
    body: 'Find everything you need for your next bout, from a first kit to competition gear.',
    primary: undefined,
    secondary: { label: 'Continue shopping', url: '/collections/all' },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: 'Your cart is empty' })).toBeVisible();
    await expect(canvas.getAllByRole('link')).toHaveLength(1);
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** A heading alone, with no text or next steps. */
export const HeadingOnly = {
  args: { body: '', primary: undefined, secondary: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 2, name: "We couldn't load this product" })).toBeVisible();
    await expect(canvas.queryByText("Your connection or our store didn't respond.")).toBeNull();
    await expect(canvas.queryByRole('link')).toBeNull();
  },
};
