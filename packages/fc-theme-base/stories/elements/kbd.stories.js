import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/** `snippets/ui-kbd.liquid`: a key cap for keyboard hints, such as the search panel's footer. */
export default {
  title: 'Elements/Kbd',
  render: snippet('ui-kbd'),
  args: { label: 'Esc' },
};

export const Label = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('kbd')).toHaveTextContent('Esc');
  },
};

export const Arrows = {
  args: { label: undefined, icons: 'arrow-up,arrow-down' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('kbd svg')).toHaveLength(2);
  },
};

export const Enter = {
  args: { label: undefined, icons: 'corner-down-left' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('kbd svg')).toHaveLength(1);
  },
};
