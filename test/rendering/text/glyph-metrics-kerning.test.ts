import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { GlyphMetrics } from '#rendering/text/GlyphMetrics';

const widths: Record<string, number> = { a: 10, b: 10, c: 10, ab: 20, bc: 15, abc: 30 };

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: widths[text] ?? 0 }),
    }),
  });
});

afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ fillStyle: '', fillRect: () => {}, drawImage: () => {} }),
  });
});

describe('GlyphMetrics.getKerning', () => {
  test('pairs that concatenate to the same string are cached separately', () => {
    const metrics = new GlyphMetrics({ family: 'Roboto', fontWeight: '400' });

    expect(metrics.getKerning('a', 'bc', 16)).toBe(30 - 10 - 15);
    expect(metrics.getKerning('ab', 'c', 16)).toBe(30 - 20 - 10);
  });
});
