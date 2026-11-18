import { Drop } from 'liquidjs';

// Cart fixtures for the cart state lab. Every state renders the production flyout or cart page section;
// states that only exist in the browser are applied by cart-states.js through the production controllers.
const image = name => ({ src: `/assets/${name}`, alt: '' });

// Shopify's cart equals `empty` when it has no items; liquidjs compares a drop by its value.
class CartDrop extends Drop {
  constructor(fields) {
    super();
    Object.assign(this, fields);
  }

  valueOf() {
    return this.items;
  }
}

function line(index, { key, productId, variantId, title, options = [], price, compareAt = null, quantity = 1, picture, available = true, stock = null, components = [], properties = {} }) {
  return {
    index, key, quantity, url: '#product', url_to_remove: '#remove', product_id: productId, properties,
    product: { id: productId, title, has_only_default_variant: options.length === 0 },
    variant: {
      id: variantId, available, price, compare_at_price: compareAt, quantity_price_breaks: [],
      quantity_rule: { min: 1, increment: 1, max: null },
      inventory_management: stock === null ? null : 'shopify', inventory_policy: 'deny', inventory_quantity: stock,
    },
    image: image(picture), options_with_values: options.map(([name, value]) => ({ name, value })),
    original_line_price: price * quantity, final_line_price: price * quantity, item_components: components,
    instructions: { can_update_quantity: true, can_remove: true },
  };
}

const component = (title, variant, quantity = 1) => ({ quantity, product: { title, has_only_default_variant: !variant }, variant: { title: variant || 'Default Title' } });
const jacket = index => line(index, { key: '8011:jacket', productId: 801, variantId: 8011, title: 'Competition jacket 350N', options: [['Cut', 'Mens'], ['Size', '44']], price: 18995, compareAt: 21995, picture: 'collection-fie-800n-jacket.jpg' });
const kit = index => line(index, {
  key: '8021:kit', productId: 802, variantId: 8021, title: 'Club starter kit', price: 32900, picture: 'mega-club-kids.jpg',
  components: [component('Foil', 'French grip, size 5'), component('Mask', 'M'), component('Glove', 'M'), component('Fencing socks', 'M', 2)],
});
const glove = (index, stock = 20) => line(index, { key: '8031:glove', productId: 803, variantId: 8031, title: 'Grip fencing glove', options: [['Size', 'M']], price: 3495, quantity: 2, stock, picture: 'collection-grip-fencing-glove.jpg' });
const plastron = index => line(index, { key: '8041:plastron', productId: 804, variantId: 8041, title: 'Underarm protector 800N', options: [['Side', 'Right'], ['Size', 'M']], price: 4995, available: false, picture: 'collection-underarm-plastron-800n.jpg' });

function cart(items, { note = '', discounts = [], codes = [] } = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.final_line_price, 0);
  const applications = discounts.map(([title, amount, type = 'discount_code']) => ({ title, type, total_allocated_amount: amount, target_selection: 'all', target_type: 'line_item' }));
  return {
    liquid: new CartDrop({
      items, note, item_count: items.reduce((sum, item) => sum + item.quantity, 0), items_subtotal_price: subtotal,
      total_price: subtotal - applications.reduce((sum, application) => sum + application.total_allocated_amount, 0),
      cart_level_discount_applications: applications, discount_applications: applications, requires_shipping: items.length > 0,
      taxes_included: false, currency: { symbol: '$', iso_code: 'USD' },
    }),
    json: {
      note, item_count: items.reduce((sum, item) => sum + item.quantity, 0),
      items: items.map(item => ({ key: item.key, quantity: item.quantity, product_title: item.product.title })),
      discount_codes: codes.map(code => ({ code, applicable: true })),
    },
  };
}

const standard = () => cart([jacket(0), kit(1), glove(2)]);

// Each state names the cart it starts from. `client` states are finished by cart-states.js in the browser.
export const cartStates = [
  { id: 'ready', group: 'Flyout and cart page', label: 'Items', cart: standard },
  { id: 'just-added', group: 'Line item', label: 'Just added', cart: standard, client: true },
  { id: 'updating', group: 'Line item', label: 'Updating quantity', cart: standard, client: true },
  { id: 'stock-limit', group: 'Line item', label: 'Stock limit', cart: () => cart([jacket(0), kit(1), glove(2, 2)]) },
  { id: 'quantity-error', group: 'Line item', label: 'Quantity change failed', cart: standard, client: true },
  { id: 'remove-error', group: 'Line item', label: 'Remove failed', cart: standard, client: true },
  { id: 'removed', group: 'Line item', label: 'Removed with undo', cart: () => cart([jacket(0), kit(1)]), client: true },
  { id: 'undo-error', group: 'Line item', label: 'Undo failed', cart: () => cart([jacket(0), kit(1)]), client: true },
  { id: 'unavailable', group: 'Line item', label: 'Unavailable item', cart: () => cart([jacket(0), plastron(1), glove(2)]) },
  { id: 'kit-open', group: 'Line item', label: 'Kit contents open', cart: standard, client: true },
  { id: 'discount-open', group: 'Discount code', label: 'Entering a code', cart: standard, client: true },
  { id: 'discount-applying', group: 'Discount code', label: 'Applying', cart: standard, client: true },
  { id: 'discount-invalid', group: 'Discount code', label: 'Code not accepted', cart: standard, client: true },
  { id: 'discount-error', group: 'Discount code', label: 'Check failed', cart: standard, client: true },
  { id: 'discounts-applied', group: 'Discount code', label: 'Codes applied', cart: () => cart([jacket(0), kit(1), glove(2)], { discounts: [['WELCOME10', 5889]], codes: ['WELCOME10', 'FREESHIP'] }) },
  { id: 'discount-remove-error', group: 'Discount code', label: 'Remove failed', cart: () => cart([jacket(0), kit(1), glove(2)], { discounts: [['WELCOME10', 5889]], codes: ['WELCOME10'] }), client: true },
  { id: 'note-open', group: 'Order note', label: 'Writing a note', cart: standard, client: true },
  { id: 'note-unsaved', group: 'Order note', label: 'Unsaved note blocks checkout', cart: standard, client: true },
  { id: 'note-saving', group: 'Order note', label: 'Saving', cart: standard, client: true },
  { id: 'note-error', group: 'Order note', label: 'Save failed', cart: standard, client: true },
  { id: 'note-saved', group: 'Order note', label: 'Saved note', cart: () => cart([jacket(0), kit(1), glove(2)], { note: 'Please ship the foil and mask together. Club pickup on Thursday.' }) },
  { id: 'checkout-waiting', group: 'Summary and checkout', label: 'Waiting for changes', cart: standard, client: true },
  { id: 'checkout-opening', group: 'Summary and checkout', label: 'Opening checkout', cart: standard, client: true },
  { id: 'checkout-failed', group: 'Summary and checkout', label: 'Checkout did not open', cart: standard, client: true },
  { id: 'breakdown-open', group: 'Summary and checkout', label: 'Phone breakdown open', cart: standard, client: true },
  { id: 'empty', group: 'Cart message', label: 'Empty', cart: () => cart([]) },
  { id: 'loading', group: 'Cart message', label: 'Loading', cart: standard, client: true },
  { id: 'load-failed', group: 'Cart message', label: 'Load failed', cart: standard, client: true },
];

export const cartPageStates = ['ready', 'empty', 'loading', 'load-failed'];

export function cartState(id) {
  return cartStates.find(state => state.id === id) || cartStates[0];
}

const collection = (title, picture) => ({ title, url: '#collection', featured_image: image(picture) });
export const cartSettings = {
  show_cart_note: true,
  cart_popular_collection_1: collection('Starter kits', 'mega-club-kids.jpg'),
  cart_popular_collection_2: collection('Uniforms', 'collection-fie-800n-jacket.jpg'),
  cart_popular_collection_3: collection('Weapons', 'mega-club-reels.jpg'),
  cart_empty_link: '#collection',
};

const suggestion = (id, title, picture, price, single) => ({
  id, title, url: '#product', price, available: true, has_only_default_variant: single,
  featured_image: image(picture), selected_or_first_available_variant: { id: id * 10 + 1 },
});
export const recommendations = {
  performed: true, products_count: 3,
  products: [
    suggestion(801, 'Competition jacket 350N', 'collection-fie-800n-jacket.jpg', 18995, false),
    suggestion(805, 'Fencing socks 2-pack', 'collection-fencing-socks-2-pack.jpg', 1895, true),
    suggestion(806, 'Womens chest protector', 'collection-womens-chest-protector.jpg', 3995, false),
  ],
};
