import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildSizingManifest } from './build-manifest.mjs';

export function buildMigrationManifest(sizing, navigation, assignments, pages, collections = [], journal) {
  const { resources } = buildSizingManifest(sizing);
  for (const [key, name, type] of [
    ['weapon', 'Weapon', 'list.single_line_text_field'],
    ['gender', 'Gender', 'single_line_text_field'],
    ['skill_level', 'Skill Level', 'single_line_text_field'],
    ['protection_rating', 'Safety Level', 'single_line_text_field'],
    ['fie_status', 'FIE Rating', 'single_line_text_field'],
  ]) {
    resources.push({ key: `definition.${key}`, kind: 'product-metafield-definition', data: {
      namespace: 'custom', key, name, type, ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' },
    } });
  }
  // Other brands' logos on product cards and the product page. An entry's handle is its vendor's handle.
  resources.push({ key: 'definition.brand', kind: 'metaobject-definition', data: {
    type: 'brand', name: 'Brand', displayNameKey: 'title', access: { storefront: 'PUBLIC_READ' },
    fieldDefinitions: [
      { key: 'title', name: 'Name', type: 'single_line_text_field', required: true },
      { key: 'logo', name: 'Logo', type: 'file_reference', required: true },
    ],
  } });
  // Entries the product page's details read. A question is written once and linked from wherever it's asked.
  resources.push({ key: 'definition.question', kind: 'metaobject-definition', data: {
    type: 'question', name: 'Question', displayNameKey: 'question', access: { storefront: 'PUBLIC_READ' },
    fieldDefinitions: [
      { key: 'question', name: 'Question', type: 'single_line_text_field', required: true },
      { key: 'answer', name: 'Answer', type: 'rich_text_field', required: true },
    ],
  } });
  resources.push({ key: 'definition.product_feature', kind: 'metaobject-definition', data: {
    type: 'product_feature', name: 'Product feature', displayNameKey: 'heading', access: { storefront: 'PUBLIC_READ' },
    fieldDefinitions: [
      { key: 'image', name: 'Photo', type: 'file_reference', validations: [{ name: 'file_type_options', value: JSON.stringify(['Image']) }] },
      { key: 'heading', name: 'Heading', type: 'single_line_text_field', required: true },
      { key: 'text', name: 'Text', type: 'multi_line_text_field' },
    ],
  } });
  // The product page's specs, care and questions (docs/shopify-product-specs.md). Care symbols are the names
  // snippets/ui-care-symbol.liquid draws.
  const entries = (definition) => [{ name: 'metaobject_definition_id', value: { $ref: definition, field: 'id' } }];
  for (const [key, name, type, validations] of [
    ['closure', 'Closure', 'single_line_text_field'],
    ['care_symbols', 'Care symbols', 'list.single_line_text_field', [{ name: 'choices', value: JSON.stringify(['wash-cold', 'line-dry', 'no-bleach', 'no-tumble-dry', 'no-iron', 'no-dry-clean']) }]],
    ['care_note', 'Care note', 'multi_line_text_field'],
    ['features', 'Features', 'list.metaobject_reference', entries('definition.product_feature')],
    ['questions', 'Questions', 'list.metaobject_reference', entries('definition.question')],
  ]) {
    resources.push({ key: `definition.${key}`, kind: 'product-metafield-definition', data: {
      namespace: 'custom', key, name, type, ownerType: 'PRODUCT', ...(validations ? { validations } : {}), access: { storefront: 'PUBLIC_READ' },
    } });
  }
  for (const collection of collections) resources.push({ key: `collection.${collection.handle}`, kind: 'collection', data: collection });
  if (journal) resources.push({ key: `blog.${journal.handle}`, kind: 'blog', data: journal });
  const addLinks = (items) => items.map((item) => {
    const path = item.url.split('/');
    const kind = { collections: 'collection', pages: 'page', blogs: 'blog' }[path[1]];
    const key = `${kind}.${path[2]}`;
    const known = resources.some((resource) => resource.key === key) || pages.some((page) => `page.${page.handle}` === key);
    const link = known ? { type: kind.toUpperCase(), resourceId: { $ref: key } } : { type: 'HTTP', url: item.url };
    return { title: item.title, ...link, ...(item.items ? { items: addLinks(item.items) } : {}) };
  });
  for (const menu of navigation.menus) resources.push({ key: `menu.${menu.handle}`, kind: 'menu', data: { handle: menu.handle, title: menu.title, items: addLinks(menu.items) } });
  for (const [productHandle, chartHandle] of Object.entries(assignments)) {
    if (!sizing.charts.some((chart) => chart.handle === chartHandle)) throw new Error(`Unknown chart: ${chartHandle}`);
    resources.push({ key: `assignment.${productHandle}`, kind: 'product-chart-assignment', data: {
      productHandle, namespace: 'custom', key: 'size_chart', value: { $ref: `chart.${chartHandle}` },
    } });
  }
  for (const page of pages) resources.push({ key: `page.${page.handle}`, kind: 'page', data: page });
  return { name: 'fencing-club-migration', resources };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
  const manifest = buildMigrationManifest(await read('./sizing-source.json'), await read('./navigation-source.json'), await read('./chart-assignments.json'), await read('./pages-source.json'), (await read('./collections-source.json')).collections.nodes, await read('./journal-source.json'));
  await writeFile(new URL('./migration-manifest.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
}