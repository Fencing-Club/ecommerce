import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMigrationManifest, richText } from '../content/build-migration.mjs';

const read = async (name) => JSON.parse(await readFile(resolve('content', name), 'utf8'));

describe('Fencing Club migration package', () => {
  it('packages approved menus and explicit chart assignments without store IDs', async () => {
    const manifest = buildMigrationManifest(await read('sizing-source.json'), await read('navigation-source.json'), await read('chart-assignments.json'), []);
    expect(manifest.resources.filter((resource) => resource.kind === 'menu')).toHaveLength(6);
    expect(manifest.resources.filter((resource) => resource.kind === 'metafield-assignment' && resource.data.owner === 'PRODUCT')).toHaveLength(26);
    expect(manifest.resources.filter((resource) => ['definition.weapon', 'definition.gender', 'definition.skill_level', 'definition.protection_rating', 'definition.fie_status'].includes(resource.key)).map(resource => resource.data)).toEqual([
      { namespace: 'custom', key: 'weapon', name: 'Weapon', type: 'list.single_line_text_field', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } },
      { namespace: 'custom', key: 'gender', name: 'Gender', type: 'single_line_text_field', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } },
      { namespace: 'custom', key: 'skill_level', name: 'Skill Level', type: 'single_line_text_field', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } },
      { namespace: 'custom', key: 'protection_rating', name: 'Safety Level', type: 'single_line_text_field', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } },
      { namespace: 'custom', key: 'fie_status', name: 'FIE Rating', type: 'single_line_text_field', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } },
    ]);
    expect(manifest.resources.find((resource) => resource.key === 'definition.brand').data.fieldDefinitions.map((field) => [field.key, field.type])).toEqual([
      ['title', 'single_line_text_field'],
      ['logo', 'file_reference'],
    ]);
    // Question entries are linked from wherever they're asked, so products list them rather than holding their own text.
    expect(manifest.resources.find((resource) => resource.key === 'definition.question').data.fieldDefinitions.map((field) => [field.key, field.type])).toEqual([
      ['question', 'single_line_text_field'],
      ['answer', 'rich_text_field'],
    ]);
    expect(manifest.resources.find((resource) => resource.key === 'definition.questions').data.validations).toEqual([
      { name: 'metaobject_definition_id', value: { $ref: 'definition.question', field: 'id' } },
    ]);
    expect(JSON.parse(manifest.resources.find((resource) => resource.key === 'definition.care_symbols').data.validations[0].value)).toEqual([
      'wash-cold', 'line-dry', 'no-bleach', 'no-tumble-dry', 'no-iron', 'no-dry-clean',
    ]);
    expect(JSON.stringify(manifest)).not.toContain('gid://shopify/');
    expect(JSON.stringify(manifest)).not.toContain('/collections/sabre');
    expect(JSON.stringify(manifest)).not.toContain('/apps/track');
  });

  it('writes each question once and links it from the FAQ page, the Contact page and collections', async () => {
    const pages = [{ handle: 'faq', title: 'FAQ', body: '', templateSuffix: 'faq', isPublished: true }];
    const manifest = buildMigrationManifest(await read('sizing-source.json'), { menus: [] }, {}, pages, [], undefined, await read('questions-source.json'));
    const byKey = new Map(manifest.resources.map((resource) => [resource.key, resource]));
    const questions = manifest.resources.filter((resource) => resource.data.type === 'question' && resource.kind === 'metaobject');
    expect(new Set(questions.map((resource) => resource.data.fields.question)).size).toBe(questions.length);

    const faq = byKey.get('assignment.page.faq.faq_topics');
    expect(faq.data).toMatchObject({ owner: 'PAGE', handle: 'faq', type: 'list.metaobject_reference' });
    expect(faq.dependsOn).toContain('page.faq');
    const shipping = byKey.get(faq.data.value[0].$ref);
    expect(shipping.data.fields.title).toBe('Shipping');
    expect(byKey.get(shipping.data.fields.questions[0].$ref).data.fields.question).toBe('How do I track my order?');

    expect(byKey.get('assignment.page.contact.questions').data.value).toHaveLength(3);
    expect(byKey.get('assignment.collection.jackets.questions').data).toMatchObject({ owner: 'COLLECTION', key: 'questions' });
    expect(byKey.get('definition.collection.questions').data).toMatchObject({ ownerType: 'COLLECTION', type: 'list.metaobject_reference' });
  });

  it('turns answer paragraphs and links into rich text and rejects other markup', () => {
    expect(richText('<p>Email <a href="mailto:help@example.com">us</a> &amp; wait.</p><p>Thanks.</p>')).toEqual({
      type: 'root',
      children: [
        { type: 'paragraph', children: [
          { type: 'text', value: 'Email ' },
          { type: 'link', url: 'mailto:help@example.com', children: [{ type: 'text', value: 'us' }] },
          { type: 'text', value: ' & wait.' },
        ] },
        { type: 'paragraph', children: [{ type: 'text', value: 'Thanks.' }] },
      ],
    });
    expect(() => richText('<p>Hi <strong>there</strong></p>')).toThrow('Unsupported answer HTML');
    expect(() => richText('Plain text')).toThrow('Unsupported answer HTML');
  });

  it('rejects a link to a question that is not in the pack', async () => {
    const source = { questions: [], faqTopics: [{ handle: 'shipping', title: 'Shipping', questions: ['missing'] }], links: [] };
    const sizing = await read('sizing-source.json');
    expect(() => buildMigrationManifest(sizing, { menus: [] }, {}, [], [], undefined, source)).toThrow('Unknown question: missing');
  });

  it('rejects an assignment to a missing chart', () => {
    expect(() => buildMigrationManifest({ charts: [], guides: [], groups: [] }, { menus: [] }, { jacket: 'missing' }, [])).toThrow('Unknown chart');
  });

  it('resolves packaged collection and page links through stable resource keys', async () => {
    const navigation = { menus: [{ handle: 'main-menu', title: 'Main menu', items: [{ title: 'Jackets', url: '/collections/jackets' }, { title: 'Contact', url: '/pages/contact' }] }] };
    const manifest = buildMigrationManifest(await read('sizing-source.json'), navigation, {}, [{ handle: 'contact', title: 'Contact', body: '', templateSuffix: 'contact', isPublished: true }], [{ handle: 'jackets', title: 'Jackets', descriptionHtml: '', sortOrder: 'ALPHA_ASC', productHandles: [], image: null }]);
    expect(manifest.resources.find((resource) => resource.key === 'menu.main-menu').data.items).toEqual([
      { title: 'Jackets', type: 'COLLECTION', resourceId: { $ref: 'collection.jackets' } },
      { title: 'Contact', type: 'PAGE', resourceId: { $ref: 'page.contact' } },
    ]);
  });
});