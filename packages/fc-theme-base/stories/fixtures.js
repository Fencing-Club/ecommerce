import { assetUrl } from './liquid.js';

// Shopify image and resource objects for stories, using the theme's own sample images.

const image = (file, alt) => ({ src: assetUrl(file), alt, width: 800, height: 800, aspect_ratio: 1 });

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
