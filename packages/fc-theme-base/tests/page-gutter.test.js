// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The page layout lives in one place: base.css defines the gutter tokens and `.page-width`.
// Everything else uses them, so a section can't drift onto a gutter of its own.

const root = resolve('.');
const tokenFile = 'assets/base.css';

const liquidStyles = source =>
  [...source.matchAll(/{%-?\s*(?:stylesheet|style)\s*-?%}([\s\S]*?){%-?\s*end(?:stylesheet|style)\s*-?%}|<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(match => match[1] ?? match[2])
    .join('\n');

const sources = [
  ...readdirSync(join(root, 'assets'))
    .filter(name => name.endsWith('.css'))
    .map(name => [`assets/${name}`, readFileSync(join(root, 'assets', name), 'utf8')]),
  ...['sections', 'snippets', 'layout'].flatMap(folder =>
    readdirSync(join(root, folder))
      .filter(name => name.endsWith('.liquid'))
      .map(name => [`${folder}/${name}`, liquidStyles(readFileSync(join(root, folder, name), 'utf8'))]),
  ),
].map(([file, css]) => [file, css.replace(/\/\*[\s\S]*?\*\//g, '')]);

/** Flattens a stylesheet into its declarations, each with the selector it sits under. */
function declarations(css) {
  const found = [];
  const selectors = [];
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      selectors.push(buffer.trim());
      buffer = '';
    } else if (char === '}') {
      if (buffer.includes(':')) found.push({ selector: selectors.at(-1), text: buffer.trim() });
      selectors.pop();
      buffer = '';
    } else if (char === ';') {
      if (buffer.includes(':')) found.push({ selector: selectors.at(-1), text: buffer.trim() });
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return found.map(({ selector, text }) => {
    const colon = text.indexOf(':');
    return { selector: selector?.replace(/\s+/g, ' '), property: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() };
  });
}

/** The horizontal part of a padding or margin declaration, or undefined for other properties. */
function inlineValue({ property, value }) {
  const parts = value.split(/\s+(?![^(]*\))/);
  if (/^(padding|margin)$/.test(property)) return parts.length === 1 ? parts[0] : parts[1];
  if (/^(padding|margin)-(inline|left|right)$/.test(property)) return value;
  return undefined;
}

const usesToken = value => /var\(--(page-gutter|gutter)\)/.test(value);
const others = sources.filter(([file]) => file !== tokenFile);

describe('page gutter', () => {
  it('defines the gutter and content width once, in base.css', () => {
    const base = declarations(sources.find(([file]) => file === tokenFile)[1]);
    expect(base.filter(rule => rule.property === '--gutter').map(rule => rule.value)).toEqual(['1.6rem', '2.4rem']);
    expect(base.find(rule => rule.property === '--content-max').value).toBe('124.8rem');
    expect(base.find(rule => rule.property === '--page-gutter').value).toBe(
      'max(var(--gutter), calc((100% - var(--content-max)) / 2))',
    );
    expect(base.find(rule => rule.selector === '.page-width' && rule.property === 'padding-inline').value).toBe(
      'var(--page-gutter)',
    );

    const redefined = others.flatMap(([file, css]) =>
      declarations(css)
        .filter(rule => ['--gutter', '--content-max', '--page-gutter'].includes(rule.property))
        .map(rule => `${file}: ${rule.selector}`),
    );
    expect(redefined).toEqual([]);
  });

  it('leaves no section with its own content width or centering math', () => {
    const offenders = others.flatMap(([file, css]) =>
      declarations(css)
        // The content width itself, or centering a box by halving what's left of the page.
        .filter(rule => /124\.8rem|1248px|\(100(%|vw) - (\d{3,}px|\d{2,}(\.\d+)?rem)\) \/ 2/.test(rule.value))
        .map(rule => `${file}: ${rule.selector} { ${rule.property}: ${rule.value} }`),
    );
    expect(offenders).toEqual([]);
  });

  it('gives .page-width no gutter but the shared one', () => {
    const offenders = others.flatMap(([file, css]) =>
      declarations(css)
        .filter(rule => rule.selector?.includes('.page-width'))
        .filter(rule => {
          const inline = inlineValue(rule);
          return inline !== undefined && !/^0(rem|px)?$/.test(inline) && !usesToken(inline);
        })
        .map(rule => `${file}: ${rule.selector} { ${rule.property}: ${rule.value} }`),
    );
    expect(offenders).toEqual([]);
  });
});
