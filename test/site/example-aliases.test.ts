import { beforeEach, describe, expect, it } from 'vitest';

import { EXAMPLE_ALIASES, resolveExampleAlias } from '../../site/src/lib/example-aliases';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import { readUrlState } from '../../site/src/lib/url-state';
import { CURRENT_VERSION_ID } from '../../site/src/lib/versions';

const catalogPaths = new Set(Object.values(EXAMPLES_CATALOG).flatMap(list => list.map(entry => entry.path)));

/** The catalog example path a playground URL opens. */
const resolveRequest = (url: string): string | null => {
  window.history.replaceState(null, '', url);

  const { version, example } = readUrlState();
  const versionId = version ?? CURRENT_VERSION_ID;

  if (example === null) {
    return null;
  }

  return versionId === CURRENT_VERSION_ID ? resolveExampleAlias(example) : example;
};

describe('playground legacy routes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/en/playground/');
  });

  it('opens the asset browser as a current example from query and hash links', () => {
    expect(resolveRequest('/en/playground/?version=current&example=debug-layer/asset-browser')).toBe('debug-layer/asset-browser.js');
    expect(resolveRequest('/en/playground/#/current/debug-layer/asset-browser')).toBe('debug-layer/asset-browser.js');
    expect(catalogPaths.has('debug-layer/asset-browser.js')).toBe(true);
  });

  it('keeps a historical version on its own copy of an example', () => {
    expect(resolveRequest('/en/playground/#/0.17.0/debug-layer/asset-browser')).toBe('debug-layer/asset-browser.js');
  });

  it('keeps a historical version on its own copy of a merged example', () => {
    expect(resolveRequest('/en/playground/#/0.17.0/text-fonts/basic-text')).toBe('text-fonts/basic-text.js');
  });

  it('maps a merged example to its current replacement', () => {
    expect(resolveRequest('/en/playground/#/current/text-fonts/basic-text')).toBe('text-fonts/typographic-styling.js');
    expect(resolveRequest('/en/playground/?example=text-fonts/basic-text')).toBe('text-fonts/typographic-styling.js');
  });

  it('opens a current example unchanged', () => {
    expect(resolveRequest('/en/playground/#/current/text-fonts/typographic-styling')).toBe('text-fonts/typographic-styling.js');
  });

  it('resolves nothing for a link without an example', () => {
    expect(resolveRequest('/en/playground/#/current')).toBeNull();
    expect(resolveRequest('/en/playground/?version=current')).toBeNull();
  });
});

describe('playground legacy route tables', () => {
  it('points every example alias at a current catalog example', () => {
    const dangling = Object.entries(EXAMPLE_ALIASES).filter(([, target]) => !catalogPaths.has(target));

    expect(dangling).toEqual([]);
  });

  it('never aliases a path that is still in the catalog', () => {
    expect(Object.keys(EXAMPLE_ALIASES).filter(path => catalogPaths.has(path))).toEqual([]);
  });
});
