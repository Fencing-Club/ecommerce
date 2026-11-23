import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

const symbols = ['wash-cold', 'line-dry', 'no-bleach', 'no-tumble-dry', 'no-iron', 'no-dry-clean'];
const symbol = snippet('ui-care-symbol');

/**
 * `snippets/ui-care-symbol.liquid`: one laundry care symbol over what it means, as the product page's Care shows them.
 * A name it doesn't know renders nothing.
 */
export default {
  title: 'Components/Care symbol',
  render: symbol,
  args: { symbol: 'wash-cold' },
};

export const MachineWashCold = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Machine wash cold')).toBeVisible();
  },
};

export const EverySymbol = {
  render: () =>
    `<ul class="list-unstyled" style="display: grid; grid-template-columns: repeat(6, 11rem); gap: 1.2rem;">${symbols.map((name) => `<li style="display: flex">${symbol({ symbol: name })}</li>`).join('')}</ul>`,
  play: async ({ canvas }) => {
    for (const label of ['Machine wash cold', 'Hang to dry', 'No bleach', 'No tumble dry', 'No ironing', 'No dry cleaning']) {
      await expect(canvas.getByText(label)).toBeVisible();
    }
  },
};

export const UnknownSymbol = {
  args: { symbol: 'steam-press' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-care-symbol')).toBeNull();
  },
};
