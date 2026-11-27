import { describe, expect, it } from 'vitest';

import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { WrapModes } from '#rendering/types';

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

it('retains shader batch metadata across a capacity flush', () => {
  const harness = createWebGl2Harness({ spriteRendererBatchSize: 2 });
  const texture = makeTexture();
  const root = new RetainedContainer();
  const sprites = Array.from(
    { length: 3 },
    () => new RepeatingSprite(texture, { width: 32, height: 32, modeX: 'mirror-repeat', modeY: 'stretch' }),
  );
  root.addChild(...sprites);
  const bindTexture = vi.spyOn(harness.backend, 'bindTexture');
  const transforms = vi.spyOn(harness.backend, 'bindTransformBufferTexture');
  const sampler = vi.fn();
  Object.assign(harness.context, { samplerParameteri: sampler });

  try {
    expect(measureFrame(harness, root).drawCalls).toBe(2);
    expect(bindTexture.mock.calls.every(([bound]) => bound !== null)).toBe(true);
    expect(transforms.mock.calls.at(-1)![1]).toBeGreaterThanOrEqual(3);
    expect(sampler).toHaveBeenCalledWith(expect.anything(), harness.context.TEXTURE_WRAP_S, WrapModes.MirroredRepeat);
    expect(sampler).toHaveBeenCalledWith(expect.anything(), harness.context.TEXTURE_WRAP_T, WrapModes.ClampToEdge);
    expect(sampler).toHaveBeenCalledTimes(4);
  } finally {
    root.destroy();
    texture.destroy();
    harness.destroy();
  }
});
