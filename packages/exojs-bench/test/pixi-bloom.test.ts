import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

test('Pixi composite bloom calibrates sigma for its blur kernel', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/rendering/adapters/pixi.ts'), 'utf8');
  const bloom = source.slice(source.indexOf('const bloomStrength = compositeBlurStrength(spec)'), source.indexOf('bloom = { capture'));

  expect(bloom).toContain('strength: bloomStrength / PIXI_KERNEL_SIGMA, quality: 1, kernelSize: BLUR_TAPS_PER_SIDE * 2 + 1');
});
