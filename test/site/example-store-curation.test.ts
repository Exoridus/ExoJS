// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import examples from '../../examples/examples.json';
import { EXAMPLE_ALIASES } from '../../site/src/lib/example-aliases';
import { getExampleByPath, getExamplesList, getNestedExamples, loadExamples } from '../../site/src/lib/example-store';
import { PRESERVED_EXAMPLES } from '../../site/src/lib/preserved-examples';
import { configureUrls } from '../../site/src/lib/url-builder';

beforeAll(async () => {
  configureUrls({ baseUrl: 'https://example.test/ExoJS/' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(examples))),
  );
  await loadExamples('current');
  await loadExamples('0.19.0');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('current Playground collection', () => {
  it('shows every canonical runnable source once in the thematic explorer', () => {
    const sources = [...Object.values(examples).flat(), ...PRESERVED_EXAMPLES];
    const expected = [...new Set(sources.map(entry => EXAMPLE_ALIASES[entry.path] ?? entry.path))].sort();
    const visible = getExamplesList('current').map(entry => entry.path);
    expect([...visible].sort()).toEqual(expected);
    expect(new Set(visible).size).toBe(visible.length);
    expect(getNestedExamples('current').has('Scenes & assets')).toBe(true);
  });

  it('keeps preserved sources available through direct links', () => {
    expect(getExamplesList('current').some(example => example.path === 'tilemap/hexagonal-grid.js')).toBe(true);
    expect(getExampleByPath('current', 'tilemap/hexagonal-grid.js')?.path).toBe('tilemap/hexagonal-grid.js');
  });

  it('places runnable guide samples in their matching example categories', () => {
    expect(getExampleByPath('current', 'guide-fixtures/application-loading.js')?.section).toBe('scenes-assets');
    expect(getExampleByPath('current', 'guide-fixtures/text-styles.js')?.section).toBe('graphics-text');
    expect(getExampleByPath('current', 'guide-fixtures/bitmap-layout.js')?.section).toBe('graphics-text');
  });

  it('keeps aliases compatible without listing superseded entries', () => {
    for (const [alias, target] of Object.entries(EXAMPLE_ALIASES)) {
      expect(getExampleByPath('current', alias)?.path).toBe(target);
      expect(getExamplesList('current').some(example => example.path === alias)).toBe(false);
    }
  });

  it('keeps the released-version catalog available', () => {
    expect(getExamplesList('0.19.0').some(example => example.path === 'tilemap/hexagonal-grid.js')).toBe(true);
  });
});
