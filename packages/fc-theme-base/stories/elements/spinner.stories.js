import { expect } from 'storybook/test';
import { snippet } from '../liquid.js';

/**
 * `snippets/loading-spinner.liquid`: the spinning ring buttons and panels show while they wait. It is hidden until its
 * owner shows it; this story passes the class without `hidden`.
 */
export default {
  title: 'Elements/Spinner',
  render: snippet('loading-spinner'),
  args: { class: 'loading__spinner' },
};

export const Default = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.loading__spinner svg.spinner')).toBeVisible();
  },
};
