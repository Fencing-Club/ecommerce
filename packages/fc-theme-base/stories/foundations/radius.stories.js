import { expect } from 'storybook/test';

const radii = [
  ['radius-sm', 'Small marks: badges, checkboxes'],
  ['radius-md', 'Controls: buttons, fields, selects, the quantity stepper'],
  ['radius-lg', 'Notices'],
  ['radius-xl', 'Cards and media'],
];

/** The corner radius scale. Pills and swatches stay fully rounded. */
export default {
  title: 'Foundations/Radius',
  render: () => `
    <style>
      .radius-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 2.4rem; margin: 0; padding: 0; list-style: none; color: var(--foreground); }
      .radius-item { display: grid; gap: 0.8rem; font-size: 1.3rem; }
      .radius-item span:first-child { height: 9.6rem; border: 1px solid var(--input); background: var(--muted); }
      .radius-item p { margin: 0; color: var(--muted-foreground); }
    </style>
    <ul class="radius-list">${radii
      .map(([name, use]) => `<li class="radius-item"><span style="border-radius: var(--${name})"></span><code>--${name}</code><p>${use}</p></li>`)
      .join('')}</ul>`,
};

export const Radius = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(radii.length);
  },
};
