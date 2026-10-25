// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import examples from '../../examples/examples.json';
import { getExampleByPath, getExamplesList, getNestedExamples, loadExamples } from '../../site/src/lib/example-store';
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
  it('shows only the 48 curated examples in ten sections while acceptance is pending', () => {
    expect(getExamplesList('current')).toHaveLength(48);
    expect(getNestedExamples('current').size).toBe(10);
  });

  it('keeps preserved sources available through direct links', () => {
    expect(getExamplesList('current').some(example => example.path === 'tilemap/hexagonal-grid.js')).toBe(false);
    expect(getExampleByPath('current', 'tilemap/hexagonal-grid.js')?.path).toBe('tilemap/hexagonal-grid.js');
  });

  it('keeps the released-version catalog available', () => {
    expect(getExamplesList('0.19.0').some(example => example.path === 'tilemap/hexagonal-grid.js')).toBe(true);
  });
});
