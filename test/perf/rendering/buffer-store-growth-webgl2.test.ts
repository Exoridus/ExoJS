import { describe, expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';

import { makeTextures } from './fixtures';
import { createWebGl2Harness, measureFrame } from './harness';

/**
 * A live batch's instance store is allocated at the batch capacity once; a
 * flush uploads only the filled prefix. Whether the next, larger flush fits the
 * store or reallocates it depends on what the runtime remembers as the store's
 * size after a prefix upload - and a runtime that wrote the prefix length back
 * as the size reallocated on every growing frame, for every live batch in the
 * engine.
 */
describe('WebGL2 buffer store: a growing prefix upload stays in place', () => {
  test('a larger batch after a smaller one uploads in place, without an orphaning bufferData', () => {
    const harness = createWebGl2Harness();

    try {
      const [texture] = makeTextures(1);
      const root = new Container();
      const first = new Sprite(texture!);
      const second = new Sprite(texture!);

      first.setPosition(10, 10);
      second.setPosition(80, 80);
      root.addChild(first);
      root.addChild(second);

      // Frame 1: the batch fills two of its instance rows. Frame 2: a third
      // sprite joins, the batch grows, and the store allocated at connect
      // still holds it - a reallocation here is the runtime forgetting that.
      measureFrame(harness, root);

      const third = new Sprite(texture!);

      third.setPosition(150, 150);

      const grown = measureFrame(harness, root, () => root.addChild(third));

      expect(grown.instances).toBe(3);
      expect(grown.bufferReallocations).toBe(0);
      expect(grown.bufferUploads).toBeGreaterThan(0);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });
});
