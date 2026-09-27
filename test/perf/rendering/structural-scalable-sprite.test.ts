import { describe, expect, it } from 'vitest';

import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';

import { makeRegion, makeTexture } from './fixtures';
import { createWebGl2Harness, measureFrame } from './harness';

describe('scalable sprite renderer family', () => {
  it('batches mixed geometry over one texture through live, recorded and replayed frames', () => {
    const harness = createWebGl2Harness();
    const texture = makeTexture();
    const root = new RetainedContainer();
    const nine = new NineSliceSprite(texture, { slices: 4, width: 64, height: 64 });
    const repeating = new RepeatingSprite(makeRegion(texture), { width: 64, height: 64 });

    root.addChild(nine, repeating);

    try {
      for (let frame = 0; frame < 4; frame++) {
        const measured = measureFrame(harness, root);

        expect(measured.drawCalls).toBe(1);
        expect(measured.batches).toBe(1);
        expect(measured.visibleNodes).toBe(2);
        expect(measured.instances).toBe(10);
      }
    } finally {
      root.destroy();
      texture.destroy();
      harness.destroy();
    }
  });
});
