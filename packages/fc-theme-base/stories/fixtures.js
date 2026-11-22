import { assetUrl } from './liquid.js';

// Shopify image and resource objects for stories, using the theme's own sample images.

export const image = (file, alt) => ({ src: assetUrl(file), alt, width: 800, height: 800, aspect_ratio: 1 });

const product = (id, title, type, file, price) => ({
  id,
  title,
  type,
  url: `#product-${id}`,
  price,
  available: true,
  featured_image: image(file, title),
  variants: [{ id: id * 10 }, { id: id * 10 + 1 }],
  selected_or_first_available_variant: { id: id * 10, available: true },
});

export const products = [
  product(801, 'Competition jacket', 'Jackets', 'collection-aero-competition-jacket.jpg', 6995),
  product(802, 'Fencing glove', 'Gloves', 'collection-grip-fencing-glove.jpg', 2495),
  product(803, 'Fencing socks', 'Footwear', 'collection-fencing-socks-2-pack.jpg', 1800),
];

export const articles = [
  {
    title: 'Choosing your first fencing kit',
    url: '#article-kit',
    published_at: '2026-08-10',
    excerpt: 'Compare the equipment you need for club training.',
    image: image('collection-fie-800n-jacket.jpg', 'Fencing jacket'),
  },
  {
    title: 'Taking care of your equipment',
    url: '#article-care',
    published_at: '2026-08-17',
    excerpt: 'Prepare your bag and keep equipment ready for practice.',
    image: null,
  },
];

export const brandLogos = ['fwf', 'favero', 'blaise', 'asics'].map((name) => image(`${name}.png`, name.toUpperCase()));

/**
 * The static phase heading an About page chapter opens with: a referee's call and what it means in English.
 *
 * @param {string} meaning
 * @param {string} word
 * @param {string} [tag]
 */
export const phaseHeading = (meaning, word, tag = 'h2') => ({ id: 'phase', type: 'phase-heading', settings: { meaning, word, tag } });

/**
 * The static header group an About page section opens with: an eyebrow, a heading and an optional lead paragraph.
 *
 * @param {string} eyebrow
 * @param {string} heading
 * @param {string} [lead]
 */
export function aboutHeader(eyebrow, heading, lead) {
  const blocks = [
    { id: 'eyebrow', type: 'text', settings: { text: `<p>${eyebrow}</p>`, style: 'eyebrow' } },
    { id: 'heading', type: 'heading', settings: { heading, size: 'lg' } },
  ];
  if (lead) blocks.push({ id: 'lead', type: 'text', settings: { text: `<p>${lead}</p>`, style: 'lead' } });
  return { id: 'header', type: 'group', settings: { direction: 'column', gap: 'md' }, blocks };
}

/**
 * The static header group a homepage section opens with: an eyebrow and a heading, and a link beside them when given.
 *
 * @param {string} eyebrow
 * @param {string} heading
 * @param {{ label: string, link: string }} [link]
 */
export function sectionHeader(eyebrow, heading, link) {
  const title = [
    { id: 'eyebrow', type: 'text', settings: { text: `<p>${eyebrow}</p>`, style: 'eyebrow' } },
    { id: 'heading', type: 'heading', settings: { heading, size: 'xl' } },
  ];
  if (!link) return { id: 'header', type: 'group', settings: { direction: 'column', gap: 'md', align: 'start' }, blocks: title };
  return {
    id: 'header',
    type: 'group',
    settings: { direction: 'row', gap: 'lg', align: 'end', justify: 'between' },
    blocks: [
      { id: 'title', type: 'group', settings: { direction: 'column', gap: 'sm', align: 'start' }, blocks: title },
      { id: 'link', type: 'link', settings: link },
    ],
  };
}
