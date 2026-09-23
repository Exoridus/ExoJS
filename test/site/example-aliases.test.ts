import { beforeEach, describe, expect, it } from 'vitest';

import { EXAMPLE_ALIASES, EXAMPLE_TOOL_RELOCATIONS, resolveExampleAlias, resolveExampleToolRelocation } from '../../site/src/lib/example-aliases';
import { EXAMPLES_CATALOG } from '../../site/src/lib/examples-catalog';
import { readUrlState } from '../../site/src/lib/url-state';
import { CURRENT_VERSION_ID } from '../../site/src/lib/versions';

const catalogPaths = new Set(Object.values(EXAMPLES_CATALOG).flatMap(list => list.map(entry => entry.path)));

/** What a playground URL opens: a tool page (relative to the locale root) or a catalog example path. */
const resolveRequest = (url: string): { tool: string | null; example: string | null } => {
  window.history.replaceState(null, '', url);

  const { version, example } = readUrlState();
  const versionId = version ?? CURRENT_VERSION_ID;
  const tool = resolveExampleToolRelocation(versionId, example);

  if (tool !== null || example === null) {
    return { tool, example: null };
  }

  return { tool: null, example: versionId === CURRENT_VERSION_ID ? resolveExampleAlias(example) : example };
};

describe('playground legacy routes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/en/playground/');
  });

  it('sends a current-version query link to a relocated example to its tool page', () => {
    expect(resolveRequest('/en/playground/?version=current&example=debug-layer/asset-browser')).toEqual({ tool: 'tools/asset-browser/', example: null });
  });

  it('sends a current-version hash link to a relocated example to its tool page', () => {
    expect(resolveRequest('/en/playground/#/current/debug-layer/asset-browser')).toEqual({ tool: 'tools/asset-browser/', example: null });
  });

  it('keeps a historical version on its own copy of a relocated example', () => {
    expect(resolveRequest('/en/playground/#/0.17.0/debug-layer/asset-browser')).toEqual({ tool: null, example: 'debug-layer/asset-browser.js' });
    expect(resolveRequest('/en/playground/?version=0.17.0&example=debug-layer/asset-browser')).toEqual({ tool: null, example: 'debug-layer/asset-browser.js' });
  });

  it('keeps a historical version on its own copy of a merged example', () => {
    expect(resolveRequest('/en/playground/#/0.17.0/text-fonts/basic-text')).toEqual({ tool: null, example: 'text-fonts/basic-text.js' });
  });

  it('maps a merged example to its current replacement', () => {
    expect(resolveRequest('/en/playground/#/current/text-fonts/basic-text')).toEqual({ tool: null, example: 'text-fonts/typographic-styling.js' });
    expect(resolveRequest('/en/playground/?example=text-fonts/basic-text')).toEqual({ tool: null, example: 'text-fonts/typographic-styling.js' });
  });

  it('opens a current example unchanged', () => {
    expect(resolveRequest('/en/playground/#/current/text-fonts/typographic-styling')).toEqual({ tool: null, example: 'text-fonts/typographic-styling.js' });
  });

  it('resolves nothing for a link without an example', () => {
    expect(resolveRequest('/en/playground/#/current')).toEqual({ tool: null, example: null });
    expect(resolveRequest('/en/playground/?version=current')).toEqual({ tool: null, example: null });
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

  it('keeps tool relocations apart from example aliases and the catalog', () => {
    for (const path of Object.keys(EXAMPLE_TOOL_RELOCATIONS)) {
      expect(EXAMPLE_ALIASES[path]).toBeUndefined();
      expect(catalogPaths.has(path)).toBe(false);
    }
  });
});
