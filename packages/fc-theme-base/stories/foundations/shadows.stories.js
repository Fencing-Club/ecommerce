import { expect } from 'storybook/test';

const shadows = [
  ['xs', 'Subtle lift'],
  ['sm', 'Cards that lift on hover'],
  ['md', 'Small raised controls'],
  ['lg', 'Menus, popovers, the account menu, select and facet dropdowns'],
  ['xl', 'Panels and banners: search panel, mega menu, cookie banner'],
  ['2xl', 'Dialogs: cookie preferences'],
];

/** Elevation: Tailwind's shadow scale. Each card is painted with the live variable. */
export default {
  title: 'Foundations/Shadows',
  render: () => `
    <style>
      .shadow-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr)); gap: 4rem; margin: 0; padding: 1.6rem; list-style: none; color: var(--foreground); }
      .shadow-list li { display: grid; gap: 0.8rem; align-content: start; min-height: 12rem; padding: 2rem; border-radius: var(--radius-xl); background: var(--background); font-size: var(--text-sm); }
      .shadow-list p { margin: 0; color: var(--muted-foreground); }
    </style>
    <ul class="shadow-list">${shadows
      .map(([name, use]) => `<li style="box-shadow: var(--shadow-${name})"><code>--shadow-${name}</code><p>${use}</p></li>`)
      .join('')}</ul>`,
};

export const Shadows = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(shadows.length);
  },
};
