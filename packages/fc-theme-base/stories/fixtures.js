import { assetUrl } from './liquid.js';

// Shopify image and resource objects for stories, using the theme's own sample images.

export const image = (file, alt) => ({ src: assetUrl(file), alt, width: 800, height: 800, aspect_ratio: 1 });

/** A Question entry as Liquid reads it. The answer is the HTML `metafield_tag` renders from its rich text. */
export const question = (text, answer) => ({ question: { value: text }, answer: { value: `<p>${answer}</p>` } });

/** An FAQ topic entry: a title over Question entries. */
export const faqTopic = (title, questions) => ({ title: { value: title }, questions: { value: questions } });

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

/**
 * A product option value, which reads as its name and carries the swatch Shopify gives it, whether it's the selected
 * one, and the variant it leads to with that variant's photo.
 */
const optionValue = (name, color, { selected = false, variant = null } = {}) => ({
  name,
  selected,
  variant,
  swatch: color ? { color: { rgb: [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)).join(' ') } } : null,
  toString: () => name,
});

/**
 * A product as a grid card sees it: photos, a color option, a protection level and a vendor. A color can name the
 * photo its variant shows, by its place in `photos`.
 *
 * @param {{ id: number, title: string, vendor?: string, price: number, compare_at_price?: number, available?: boolean,
 *   photos: string[], colors?: [string, string, number?][], rating?: string, fie?: string, variants?: number }} details
 */
const cardProduct = ({ id, title, vendor = 'Fencing Club', price, compare_at_price = null, available = true, photos, colors = [], rating, fie, variants = 2 }) => {
  const media = photos.map((file, index) => ({ id: id * 100 + index, media_type: 'image', preview_image: image(file, `${title}, photo ${index + 1}`) }));
  const colorValue = ([name, color, photo], index) =>
    optionValue(name, color, {
      selected: index === 0,
      variant: { id: id * 10 + index, url: `#product-${id}?variant=${id * 10 + index}`, featured_media: photo === undefined ? null : media[photo] },
    });
  return {
    id,
    title,
    vendor,
    url: `#product-${id}`,
    price,
    compare_at_price,
    available,
    featured_image: image(photos[0], title),
    media,
    options_with_values: colors.length ? [{ name: 'Color', position: 1, values: colors.map(colorValue) }] : [],
    metafields: { custom: { protection_rating: { value: rating ?? '' }, fie_status: { value: fie ?? '' } } },
    variants: Array.from({ length: variants }, (_, index) => ({ id: id * 10 + index })),
    selected_or_first_available_variant: { id: id * 10, available },
  };
};

export const cardProducts = {
  /** Another brand's jacket on sale: 800N FIE, five photos and five colors, three with their own photo. */
  sale: cardProduct({
    id: 811,
    title: 'FIE 800N Competition Jacket',
    vendor: 'FWF',
    price: 23920,
    compare_at_price: 29900,
    // The card shows the first four photos; Navy's photo is the fifth.
    photos: [
      'collection-fie-800n-jacket.jpg',
      'collection-aero-competition-jacket.jpg',
      'collection-stretch-fencing-pants.jpg',
      'collection-underarm-plastron-800n.jpg',
      'collection-mens-chest-protector.jpg',
    ],
    colors: [['White', '#ffffff', 0], ['Black', '#101012', 1], ['Navy', '#1e2a44', 4], ['Red', '#b91c1c'], ['Blue', '#1d4ed8']],
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
 * @param {string | null} eyebrow
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
 * The static header group a homepage section opens with: a heading under an optional eyebrow, and a link beside them
 * when given.
 *
 * @param {string | null} eyebrow
 * @param {string} heading
 * @param {{ label: string, link: string }} [link]
 */
export function sectionHeader(eyebrow, heading, link) {
  const title = [
    eyebrow && { id: 'eyebrow', type: 'text', settings: { text: `<p>${eyebrow}</p>`, style: 'eyebrow' } },
    { id: 'heading', type: 'heading', settings: { heading, size: 'xl' } },
  ].filter(Boolean);
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

/**
 * One value of a Shopify collection filter, with the URLs that add or remove it.
 *
 * @param {string} param
 * @param {string} label
 * @param {number} count
 * @param {{ active?: boolean, value?: string, swatch?: object | null }} [options]
 */
const filterValue = (param, label, count, { active = false, value = label, swatch = null } = {}) => {
  const slug = `${param.split('.').pop()}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return { param_name: param, label, value, count, active, swatch, url_to_add: `#add-${slug}`, url_to_remove: `#remove-${slug}` };
};

/** A list filter as `collection.filters` holds it: `values` are `[label, count, options]`. */
const listFilter = (label, param, values, presentation = 'text') => {
  const all = values.map(([valueLabel, count, options]) => filterValue(param, valueLabel, count, options));
  return { label, type: 'list', param_name: param, presentation, values: all, active_values: all.filter((value) => value.active) };
};

/** Collection filters shaped like Shopify's, named by what they filter. Pass the labels to switch on. */
export const collectionFilters = {
  weapon: (on = []) => listFilter('Weapon', 'filter.p.m.custom.weapon', [['Foil', 64], ['Épée', 71], ['Sabre', 58]].map(([l, c]) => [l, c, { active: on.includes(l) }])),
  protection: (on = []) => listFilter('Safety Level', 'filter.p.m.custom.protection_rating', [['350N', 46], ['800N', 50], ['1600N', 0]].map(([l, c]) => [l, c, { active: on.includes(l) }])),
  fie: (on = []) => listFilter('FIE Rating', 'filter.p.m.custom.fie_status', [['FIE', 55], ['Non-FIE', 41]].map(([l, c]) => [l, c, { active: on.includes(l) }])),
  hand: (on = []) => listFilter('Hand', 'filter.v.option.hand', [['Left-handed', 9], ['Right-handed', 41]].map(([l, c]) => [l, c, { active: on.includes(l) }])),
  size: (on = []) => listFilter('Size', 'filter.v.option.size', ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Kids'].map((l, i) => [l, i === 6 ? 14 : 20, { active: on.includes(l) }])),
  color: (on = []) =>
    listFilter(
      'Color',
      'filter.v.option.color',
      [['White', '#ffffff'], ['Black', '#101012'], ['Navy', '#1e2a44'], ['Grey', '#9aa0a6'], ['Red', '#c10007'], ['Blue', '#1447e6']].map(([l, hex]) => [
        l,
        12,
        { active: on.includes(l), swatch: { color: { rgb: [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(' ') } } },
      ]),
      'swatch',
    ),
  brand: (on = []) =>
    listFilter('Brand', 'filter.p.vendor', [['Fencing Club', 81], ['FWF', 22], ['Blaise', 14], ['NEPS', 9], ['Allstar', 8], ['Uhlmann', 6], ['PBT', 4], ['Absolute', 2]].map(([l, c]) => [l, c, { active: on.includes(l) }])),
  availability: (inStock = false) => listFilter('Availability', 'filter.v.availability', [['In stock', 120, { active: inStock, value: '1' }], ['Out of stock', 17, { value: '0' }]]),
  price: (max = null) => ({
    label: 'Price',
    type: 'price_range',
    range_max: 38900,
    url_to_remove: '#remove-price',
    min_value: { param_name: 'filter.v.price.gte', value: null },
    max_value: { param_name: 'filter.v.price.lte', value: max },
  }),
};

const menuLink = (title, handle, links = []) => ({ title, url: `/collections/${handle}`, type: 'collection_link', links });

/** The main menu branch the collection page's tiles and tree read, and the collections its items link to. */
export const collectionMenu = {
  linklists: {
    'main-menu': {
      links: [
        menuLink('Weapons', 'weapons', [menuLink('Blades', 'blades')]),
        menuLink('Clothing', 'clothing', [
          menuLink('Jackets', 'jackets', [menuLink("Men's", 'mens-jackets'), menuLink("Women's", 'womens-jackets'), menuLink("Kids'", 'kids-jackets')]),
          menuLink('Pants and knickers', 'pants', [menuLink("Men's", 'mens-pants')]),
          menuLink('Plastrons', 'plastrons'),
          menuLink('Chest protectors', 'chest-protectors'),
          menuLink('Gloves', 'gloves'),
          menuLink('Socks', 'socks'),
          menuLink('Lames', 'lames'),
        ]),
      ],
    },
  },
  collections: Object.fromEntries(
    [
      ['weapons', 64, null],
      ['blades', 30, null],
      ['clothing', 137, null],
      ['jackets', 24, 'collection-aero-competition-jacket.jpg'],
      ['mens-jackets', 11, null],
      ['womens-jackets', 9, null],
      ['kids-jackets', 4, null],
      ['pants', 18, 'collection-knicker-pants-350n.jpg'],
      ['mens-pants', 10, null],
      ['plastrons', 8, 'collection-underarm-plastron-800n.jpg'],
      ['chest-protectors', 9, 'collection-fie-800n-jacket.jpg'],
      ['gloves', 12, 'collection-grip-fencing-glove.jpg'],
      ['socks', 6, 'collection-fencing-socks-2-pack.jpg'],
      ['lames', 0, null],
    ].map(([handle, count, file]) => [handle, { handle, all_products_count: count, featured_image: file ? image(file, '') : null }]),
  ),
  routes: { root_url: '/', search_url: '/search', cart_url: '/cart', all_products_collection_url: '/collections/all' },
};

/**
 * A collection as its page sees it.
 *
 * @param {{ handle?: string, title?: string, products?: object[], filters?: object[], count?: number }} [details]
 */
export const collectionPage = ({ handle = 'clothing', title = 'Clothing', products: items = Object.values(cardProducts), filters = [], count } = {}) => ({
  id: 9001,
  handle,
  title,
  url: `/collections/${handle}`,
  description:
    '<p>Jackets, knickers, plastrons and gloves for every level, from 350N club kit to 800N FIE for international events. We stock every item in our Woodinville warehouse, and our own team packs your order.</p>',
  products: items,
  products_count: count ?? items.length,
  all_products_count: 137,
  filters,
  all_vendors: ['Fencing Club', 'FWF', 'Blaise', 'Favero'],
  sort_by: '',
  default_sort_by: 'best-selling',
  sort_options: [
    { name: 'Featured', value: 'manual' },
    { name: 'Best selling', value: 'best-selling' },
    { name: 'Price, low to high', value: 'price-ascending' },
    { name: 'Price, high to low', value: 'price-descending' },
  ],
});

const chartEntry = (handle, size, height, chest) => ({
  system: { type: 'size_chart_entry', handle },
  size_label: { value: size },
  height_cm: { value: height },
  chest_cm: { value: chest },
});

/** A complete size_chart entry, as the product's custom.size_chart field gives it. */
export const sizeChart = {
  system: { type: 'size_chart', handle: 'underarm-protectors', url: '/pages/size-charts/underarm-protectors' },
  title: { value: 'Underarm protectors' },
  entries: {
    value: [
      chartEntry('underarm-xs', 'XS', '158–164', '88–92'),
      chartEntry('underarm-s', 'S', '164–170', '92–96'),
      chartEntry('underarm-m', 'M', '170–176', '96–100'),
      chartEntry('underarm-l', 'L', '176–182', '100–104'),
      chartEntry('underarm-xl', 'XL', '182–188', '104–108'),
    ],
  },
  measurement_keys: { value: ['height_cm', 'chest_cm'] },
  measurement_labels: { value: ['Height (cm)', 'Chest (cm)'] },
  imperial_keys: { value: null },
  imperial_labels: { value: null },
  guide: {
    value: {
      system: { type: 'measurement_guide' },
      title: { value: 'Chest' },
      instructions: { value: 'Measure around the fullest part of your chest, under your arms.' },
      image: { value: image('collection-underarm-plastron-800n.jpg', '') },
      alt_text: { value: 'Where to measure your chest' },
    },
  },
  fit_advice: { value: '' },
};

const quickViewSizes = ['XS', 'S', 'M', 'L', 'XL'];
const quickViewHands = ['Right', 'Left'];
const woodinville = { available: true, location: { address: { city: 'Woodinville', province_code: 'WA' } } };
const quickViewPhotos = ['collection-underarm-plastron-800n.jpg', 'collection-fie-800n-jacket.jpg', 'collection-aero-competition-jacket.jpg'].map(
  (file, index) => {
    const photo = image(file, `Novus Underarm Protector 350N, photo ${index + 1}`);
    return { ...photo, id: 9100 + index, media_type: 'image', preview_image: photo };
  },
);
// Every size in both hands. XL is sold out, and M right-handed is the one in our Woodinville store.
const quickViewVariants = quickViewSizes.flatMap((size, sizeIndex) =>
  quickViewHands.map((hand, handIndex) => ({
    id: 9200 + sizeIndex * 2 + handIndex,
    title: `${size} / ${hand}`,
    options: [size, hand],
    available: size !== 'XL',
    price: 2195,
    compare_at_price: null,
    featured_media: null,
    store_availabilities: [{ ...woodinville, available: size === 'M' && hand === 'Right' }],
    url: `/products/novus-underarm-protector?variant=${9200 + sizeIndex * 2 + handIndex}`,
  })),
);

/**
 * The product quick view shows, as `sections/product-quick-view.liquid` sees it: sizes in both hands, three photos, a
 * rating and a size chart. With a variant id it's that variant's page, as `?variant=` gives it; without one nothing is
 * chosen yet.
 *
 * @param {number} [variantId]
 */
export const quickViewProduct = (variantId) => {
  const chosen = quickViewVariants.find((variant) => variant.id === variantId) ?? null;
  const current = chosen ?? quickViewVariants[0];
  let nextValue = 9300;
  const values = (names, position) =>
    names.map((name) => ({
      id: nextValue++,
      name,
      selected: current.options[position - 1] === name,
      available: name !== 'XL',
      swatch: null,
      toString: () => name,
    }));
  return {
    id: 9001,
    title: 'Novus Underarm Protector 350N',
    vendor: 'FWF',
    url: '/products/novus-underarm-protector',
    description: '<p>A light 350N underarm protector for club training and domestic events, worn under the jacket on your weapon arm.</p>',
    price: 2195,
    compare_at_price: null,
    available: true,
    featured_image: quickViewPhotos[0],
    media: quickViewPhotos,
    has_only_default_variant: false,
    options_with_values: [
      { name: 'Size', position: 1, values: values(quickViewSizes, 1) },
      { name: 'Hand Orientation', position: 2, values: values(quickViewHands, 2) },
    ],
    variants: quickViewVariants,
    selected_variant: chosen,
    selected_or_first_available_variant: current,
    metafields: {
      custom: { protection_rating: { value: '350N' }, fie_status: { value: 'Non-FIE' }, size_chart: { value: sizeChart }, subtitle: { value: '' } },
      reviews: { rating: { value: { rating: 4.7, scale_max: 5 } }, rating_count: { value: 88 } },
    },
  };
};

const productPagePhotos = [
  'collection-underarm-plastron-800n.jpg',
  'collection-fie-800n-jacket.jpg',
  'collection-aero-competition-jacket.jpg',
  'collection-mens-chest-protector.jpg',
  'collection-knicker-pants-350n.jpg',
  'collection-grip-fencing-glove.jpg',
].map((file, index) => {
  const photo = image(file, `Novus Underarm Protector 350N, photo ${index + 1}`);
  return { ...photo, id: 9100 + index, media_type: 'image', preview_image: photo };
});

/**
 * The product page's product: quick view's protector with six photos. Size M right-handed has its own photo, the
 * third, and size S right-handed has two left.
 *
 * @param {number} [variantId]
 */
/** A product the buy box's modules offer with the main one: one variant per size, or a single default variant. */
const buyBoxProduct = ({ id, title, photo, price, sizes }) => {
  const variants = (sizes ?? ['Default Title']).map((size, index) => ({
    id: id * 10 + index,
    title: size,
    options: [size],
    available: true,
    price,
  }));
  return {
    id,
    title,
    url: `/products/${title.toLowerCase().replaceAll(' ', '-')}`,
    available: true,
    featured_image: image(photo, title),
    has_only_default_variant: !sizes,
    options: sizes ? ['Size'] : ['Title'],
    variants,
    selected_or_first_available_variant: variants[0],
  };
};

/** Complete the kit's pieces for the product page story, in the main product's sizes. */
export const kitPieces = [
  buyBoxProduct({ id: 9401, title: 'Novus Jacket 350N', photo: 'collection-fie-800n-jacket.jpg', price: 6900, sizes: quickViewSizes }),
  buyBoxProduct({ id: 9402, title: 'Knicker Pants 350N', photo: 'collection-knicker-pants-350n.jpg', price: 8900, sizes: quickViewSizes }),
];

/** Add to your order's extras for the product page story. */
export const addOnProducts = [
  buyBoxProduct({ id: 9411, title: 'Chest protector', photo: 'collection-mens-chest-protector.jpg', price: 3900 }),
  buyBoxProduct({ id: 9412, title: 'Fencing socks', photo: 'collection-fencing-socks-2-pack.jpg', price: 1800 }),
];

export const productPageProduct = (variantId) => {
  const product = quickViewProduct(variantId);
  const variants = product.variants.map((variant) => {
    if (variant.id === 9202) return { ...variant, inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 2 };
    if (variant.id === 9204) return { ...variant, featured_media: productPagePhotos[2] };
    return variant;
  });
  const find = (variant) => variant && variants.find((candidate) => candidate.id === variant.id);
  return {
    ...product,
    featured_image: productPagePhotos[0],
    media: productPagePhotos,
    variants,
    selected_variant: find(product.selected_variant) ?? null,
    selected_or_first_available_variant: find(product.selected_or_first_available_variant),
  };
};

const detailsPhoto = (file, alt) => ({ ...image(file, alt), media_type: 'image' });
const feature = (file, heading, text) => ({ image: { value: image(file, '') }, heading: { value: heading }, text: { value: text } });
const labelValues = (...labels) => ({ value: labels.map((label) => ({ label })) });

const detailsDescription =
  "<p>The Novus jacket moves with you. Four-way stretch fabric lets you lunge, recover and parry without the jacket pulling at your shoulders, and the back zip keeps the front smooth where touches land.</p><p>It's light enough to wear through a full evening of club bouts, and it washes at home.</p>";

const detailsQuestions = [
  question('Can I wear this jacket at USA Fencing tournaments?', 'Yes, at most domestic events. Wear it with an 800N underarm protector and check your event’s rules.'),
  question('How do I choose between right and left hand?', 'Pick the hand you hold your weapon in. The zip sits on the other side.'),
  question('How should I wash it?', 'Close the back zip and machine wash it cold with a color-safe detergent.'),
  question('Can I return it if the size is wrong?', 'Yes. Unworn gear comes back free within 30 days in the US.'),
  question('When will my order ship?', 'Orders placed by 2pm Pacific time on a business day ship that day.'),
  question('Does it come in kids sizes?', 'Yes. The kids Novus jacket is a separate listing.'),
  question('Is it machine washable at 40°C?', 'Wash it cold to keep the stretch fabric in shape.'),
];

const knickers = { title: "Novus Men's Knickers 350N", url: '/products/novus-mens-knickers-350n' };
const protector = { title: 'Novus Underarm Protector 800N', url: '/products/novus-underarm-protector-800n' };

/** The product details stories' product: every part's data, a reviews count and paired products. */
export const detailsJacket = {
  title: "Novus Men's Jacket 350N",
  description: detailsDescription,
  // Shipping weights in grams, which differ by size.
  variants: [{ weight: 600 }, { weight: 625 }, { weight: 650 }, { weight: 0 }],
  media: [detailsPhoto('collection-fie-800n-jacket.jpg', 'Novus jacket, front'), detailsPhoto('collection-aero-competition-jacket.jpg', 'A fencer wearing the Novus jacket')],
  metafields: {
    custom: {
      protection_rating: { value: '350N' },
      fie_status: { value: 'Non-FIE' },
      closure: { value: 'Back zip with collar strap' },
      features: {
        value: [
          feature('collection-stretch-fencing-pants.jpg', 'Four-way stretch', 'Moves with every lunge and recovery, so the jacket never pulls.'),
          feature('collection-fie-800n-jacket.jpg', 'Back zip', 'A smooth front with nothing to catch a blade.'),
          feature('collection-mens-chest-protector.jpg', 'Soft lined collar', 'Comfortable against your neck under a mask bib.'),
          feature('collection-underarm-plastron-800n.jpg', '350N protection', 'Meets EN 13567 Level 1 for club training and domestic events.'),
        ],
      },
      care_symbols: { value: ['wash-cold', 'line-dry', 'no-bleach', 'no-tumble-dry', 'no-iron', 'no-dry-clean'] },
      care_note: { value: 'Use a color-safe detergent with no bleach. Close the back zip before washing.' },
      questions: { value: detailsQuestions },
    },
    shopify: { 'gear-material': labelValues('Polyester', 'Elastane'), handedness: labelValues('Right', 'Left') },
    'shopify--discovery--product_recommendation': { complementary_products: { value: [knickers, protector] } },
    reviews: { rating_count: { value: 126 } },
  },
};

// A reviews app's block stands in for the app the store installs.
const reviewsApp = { id: 'reviews-app', type: 'text', settings: { text: '<p>Reviews from the reviews app</p>' } };
/** Every product details part, with a stand-in for the reviews app's block. */
export const detailsParts = [
  { id: 'overview', type: '_product-overview', settings: {} },
  { id: 'specs', type: '_product-specs', settings: {} },
  { id: 'care', type: '_product-care', settings: {} },
  { id: 'reviews', type: '_product-reviews', settings: {}, blocks: [reviewsApp] },
  { id: 'questions', type: '_product-questions', settings: {} },
];
