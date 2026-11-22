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

/** A product option value, which reads as its name and carries the swatch Shopify gives it. */
const optionValue = (name, color) => ({
  name,
  swatch: color ? { color: { rgb: [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)).join(' ') } } : null,
  toString: () => name,
});

/**
 * A product as a grid card sees it: photos, a color option, a protection level and a vendor.
 *
 * @param {{ id: number, title: string, vendor?: string, price: number, compare_at_price?: number, available?: boolean,
 *   photos: string[], colors?: [string, string][], rating?: string, fie?: string, variants?: number }} details
 */
const cardProduct = ({ id, title, vendor = 'Fencing Club', price, compare_at_price = null, available = true, photos, colors = [], rating, fie, variants = 2 }) => ({
  id,
  title,
  vendor,
  url: `#product-${id}`,
  price,
  compare_at_price,
  available,
  featured_image: image(photos[0], title),
  media: photos.map((file, index) => ({ media_type: 'image', preview_image: image(file, `${title}, photo ${index + 1}`) })),
  options_with_values: colors.length ? [{ name: 'Color', values: colors.map(([name, color]) => optionValue(name, color)) }] : [],
  metafields: { custom: { protection_rating: { value: rating ?? '' }, fie_status: { value: fie ?? '' } } },
  variants: Array.from({ length: variants }, (_, index) => ({ id: id * 10 + index })),
  selected_or_first_available_variant: { id: id * 10, available },
});

export const cardProducts = {
  /** Another brand's jacket on sale: 800N FIE, four photos and five colors. */
  sale: cardProduct({
    id: 811,
    title: 'FIE 800N Competition Jacket',
    vendor: 'FWF',
    price: 23920,
    compare_at_price: 29900,
    photos: ['collection-fie-800n-jacket.jpg', 'collection-aero-competition-jacket.jpg', 'collection-stretch-fencing-pants.jpg', 'collection-underarm-plastron-800n.jpg'],
    colors: [['White', '#ffffff'], ['Black', '#101012'], ['Navy', '#1e2a44'], ['Red', '#b91c1c'], ['Blue', '#1d4ed8']],
    rating: '800N',
    fie: 'FIE',
  }),
  /** Our own brand, so no logo: one photo, 350N, full price. */
  ownBrand: cardProduct({ id: 812, title: 'Knicker Pants 350N', price: 8900, photos: ['collection-knicker-pants-350n.jpg'], rating: '350N', fie: 'Non-FIE' }),
  /** Sold out with every variant gone. */
  soldOut: cardProduct({ id: 813, title: 'Novus Stretch Pants 350N', price: 7900, compare_at_price: 9900, available: false, photos: ['collection-stretch-fencing-pants.jpg'], rating: '350N' }),
  /** A single-variant product quick add puts straight in the cart. */
  single: cardProduct({ id: 814, title: 'Fencing Socks, 2 Pack', price: 1800, photos: ['collection-fencing-socks-2-pack.jpg'], variants: 1 }),
  /** A name long enough to need two lines. */
  longName: cardProduct({ id: 815, title: 'Stretch Fencing Pants 800N FIE with Adjustable Suspenders and Reinforced Knees', vendor: 'Blaise', price: 21900, photos: ['collection-stretch-fencing-pants.jpg'], rating: '800N', fie: 'FIE' }),
};

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
 * @param {'call' | 'eyebrow'} [style]
 */
export const phaseHeading = (meaning, word, tag = 'h2', style = 'call') => ({ id: 'phase', type: 'phase-heading', settings: { meaning, word, tag, style } });

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
