import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIconSnippet, iconNames, snippetPath } from '../scripts/build-icons.mjs';

const themeRoot = resolve(import.meta.dirname, '..');
const read = (folder) =>
  readdirSync(resolve(themeRoot, folder))
    .filter((file) => /\.(liquid|json)$/.test(file))
    .map((file) => readFileSync(resolve(themeRoot, folder, file), 'utf8'));

// Icon names the theme passes literally: render arguments, assigns, the Why us section's icon choices and template
// settings. An unknown name renders an empty icon instead of failing, so this is the only check for it.
function namesInUse() {
  const sources = [...read('blocks'), ...read('sections'), ...read('snippets'), ...read('templates')].join('\n');
  const patterns = [
    /\bicon(?:_name)?: '([a-z0-9-]+)'/g,
    /assign icon(?:_name)? = '([a-z0-9-]+)'/g,
    /"icon": "([a-z0-9-]+)"/g,
  ];
  const names = new Set(patterns.flatMap((pattern) => [...sources.matchAll(pattern)].map((match) => match[1])));
  const whyUs = readFileSync(resolve(themeRoot, 'sections/why-us.liquid'), 'utf8');
  for (const match of whyUs.matchAll(/"value": "([a-z0-9-]+)"/g)) names.add(match[1]);
  return [...names].sort();
}

describe('ui-icon', () => {
  it('matches what icons:build generates from scripts/icons.json', () => {
    expect(readFileSync(snippetPath, 'utf8')).toBe(buildIconSnippet());
  });

  it('includes every icon the theme names', () => {
    expect(namesInUse().filter((name) => !iconNames.includes(name))).toEqual([]);
  });
});
