import { expect, within } from 'storybook/test';
import { assetUrl, section, settings } from '../../liquid.js';

const link = (title, url = `/pages/${title.toLowerCase().replaceAll(' ', '-')}`) => ({ title, url, current: false });
const menu = (heading, links) => ({ id: heading.toLowerCase(), type: '_footer-menu', settings: { heading, menu: { links } } });

const blocks = [
  menu('Shop', [{ ...link('Masks'), current: true }, link('Jackets'), link('Weapons'), link('Blades'), link('Gloves'), link('Footwear')]),
  menu('Support', [link('Contact us'), link('Shipping'), link('Returns'), link('Size guides'), link('Track order'), link('FAQ')]),
  menu('Company', [
    link('Our story'),
    link('The Journal'),
    link('Privacy policy'),
    link('Terms of service'),
    link('Cookie preferences', '#cookie-preferences'),
  ]),
];
const staticBlocks = [
  { id: 'brand', type: '_footer-brand', settings: {} },
  { id: 'contact', type: '_footer-contact', settings: {} },
];
const variables = { settings: { ...settings, brand_image: { src: assetUrl('fencing-club-logo-light.png') } } };

/**
 * `sections/footer.liquid`: menu columns from `_footer-menu` blocks between the static `_footer-brand` and
 * `_footer-contact` blocks, over the copyright and payment marks.
 */
export default {
  title: 'Sections/Footer/Footer',
  parameters: { layout: 'fullscreen' },
  render: section('footer', { blocks, staticBlocks, variables }),
};

export const Default = {
  play: async ({ canvas }) => {
    const menus = canvas.getByRole('navigation', { name: 'Footer' });
    await expect(within(menus).getByRole('heading', { level: 2, name: 'Support' })).toBeVisible();
    await expect(within(menus).getByRole('link', { name: 'Size guides' })).toHaveAttribute('href', '/pages/size-guides');
    await expect(within(menus).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/pages/faq');
    await expect(within(menus).getByRole('link', { name: 'Masks' })).toHaveAttribute('aria-current', 'page');
    await expect(within(menus).getByRole('link', { name: 'Cookie preferences' })).toHaveAttribute('data-cookie-preferences');

    await expect(canvas.getByRole('heading', { level: 2, name: 'Contact' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Phone +1 (425) 260-2501' })).toHaveAttribute('href', 'tel:+14252602501');
    await expect(canvas.getByRole('link', { name: 'Instagram' })).toBeVisible();

    await expect(within(canvas.getByRole('list', { name: 'Payment methods' })).getAllByRole('img')).toHaveLength(6);
    await expect(canvas.getByText(/^© \d{4} Fencing Club$/)).toBeVisible();
  },
};

export const WithoutPaymentIcons = {
  args: { payment_enable: false },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('list', { name: 'Payment methods' })).toBeNull();
    await expect(canvas.getByText(/^© \d{4} Fencing Club$/)).toBeVisible();
  },
};
