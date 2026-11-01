import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { WebGl2ScalableSpriteRenderer } from '#rendering/webgl2/WebGl2ScalableSpriteRenderer';

import { createWebGl2Harness, measureFrame } from '../perf/rendering/harness';
import { createScalableAlphaSprite, createScalableAlphaTexture, scalableAlphaPaths } from './scalableSpriteAlphaFixture';

describe.each(scalableAlphaPaths)('WebGL2 scalable sample association: %s', path => {
  test('sets association per draw through live rendering and retained replay', () => {
    const harness = createWebGl2Harness({ extensions: { WEBGL_compressed_texture_s3tc: {} } });
    const straight = createScalableAlphaTexture('straight');
    const associated = createScalableAlphaTexture('premultiplied');
    const root = new Container();
    const group = new RetainedContainer();
    const draws: number[] = [];
    let association = -1;
    const uniform = vi.spyOn(harness.context, 'uniform1i').mockImplementation((location, value) => {
      if ((location as unknown as { name: string }).name === 'u_premultiplySample') {
        association = value;
      }
    });
    const draw = vi.spyOn(harness.context, 'drawArraysInstanced').mockImplementation(() => {
      draws.push(association);
    });
    const replay = vi.spyOn(WebGl2ScalableSpriteRenderer.prototype, 'replayRetainedBatch');

    for (const [index, texture] of [straight, associated, straight].entries()) {
      const sprite = createScalableAlphaSprite(texture, path);

      sprite.setPosition(index * 20, 0);
      group.addChild(sprite);
    }

    root.addChild(group);

    try {
      expect(harness.backend.shouldPremultiplyTextureSample(straight)).toBe(true);
      expect(harness.backend.shouldPremultiplyTextureSample(associated)).toBe(false);

      for (let frame = 0; frame < 3; frame++) {
        draws.length = 0;
        measureFrame(harness, root);
        expect(draws).toEqual([1, 0, 1]);
      }

      expect(replay).toHaveBeenCalledTimes(path === 'repeating-shader' ? 0 : 3);
    } finally {
      replay.mockRestore();
      draw.mockRestore();
      uniform.mockRestore();
      root.destroy();
      straight.destroy();
      associated.destroy();
      harness.destroy();
    }
  });
});
