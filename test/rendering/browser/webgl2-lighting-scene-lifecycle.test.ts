/**
 * Scene-bound lighting against a real application and a real scene director.
 *
 * Two scenes light the same white frame differently - one red, one blue - so
 * whichever lighting is in the application's frame slot is visible in the
 * presented pixel. What is under test is that preparing, discarding, retaining
 * and restoring a scene moves its lighting in and out of that slot, and that
 * the slot never holds more than one scene's passes.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { LightmapLighting } from '@codexo/exojs-lighting';

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { PIXEL_TOLERANCE, type RgbaTuple } from './_pixels';

const size = 64;
/** Passes one lightmap renderer without a filter chain installs on a float-capable device. */
const lightmapPasses = 6;

const nextFrames = async (count: number): Promise<void> => {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
};

const readPixel = (app: Application, x: number, y: number): RgbaTuple => {
  const gl = (app.backend as WebGl2Backend).context;
  const pixel = new Uint8Array(4);

  gl.readPixels(x, gl.drawingBufferHeight - y - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
};

/** A white frame, lit by nothing but `ambient`, which is then the colour that reaches the canvas. */
abstract class LitScene extends Scene {
  protected abstract readonly ambient: Color;

  public override init(): void {
    const sprite = new Sprite(Texture.fromColor(Color.white, 1));

    sprite.width = size;
    sprite.height = size;
    this.addChild(sprite);
    this.systems.add(new LightmapLighting(this.app, { ambient: this.ambient, scene: this }));
  }
}

class RedScene extends LitScene {
  protected readonly ambient = new Color(255, 0, 0);
}

class BlueScene extends LitScene {
  protected readonly ambient = new Color(0, 0, 255);
}

class UnlitScene extends Scene {
  public override init(): void {
    const sprite = new Sprite(Texture.fromColor(Color.white, 1));

    sprite.width = size;
    sprite.height = size;
    this.addChild(sprite);
  }
}

const red: RgbaTuple = [255, 0, 0, 255];
const blue: RgbaTuple = [0, 0, 255, 255];
const white: RgbaTuple = [255, 255, 255, 255];

describe('WebGL2 scene-bound lighting', () => {
  test('only the active scene lights the frame, through preload, discard, retention and restore', async () => {
    const container = document.createElement('div');

    document.body.appendChild(container);

    const app = new Application({
      hello: false,
      scenes: { RedScene, BlueScene, UnlitScene },
      canvas: { width: size, height: size, pixelRatio: 1, mount: container },
      clearColor: Color.black,
      backend: { type: 'webgl2' },
      rendering: { webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false } },
    } as ConstructorParameters<typeof Application>[0]);

    /**
     * Soft, so a run that fails shows the whole sequence of frames rather than
     * only the first one that went wrong.
     */
    const expectFrame = async (label: string, passes: number, expected: RgbaTuple): Promise<void> => {
      await nextFrames(3);

      const pixel = readPixel(app, size / 2, size / 2);

      expect.soft(app.framePasses.size, `${label}: passes in the frame slot`).toBe(passes);

      for (let i = 0; i < 4; i++) {
        expect
          .soft(Math.abs(pixel[i]! - expected[i]!), `${label}: channel ${i} of [${pixel.join(', ')}]`)
          .toBeLessThanOrEqual(PIXEL_TOLERANCE);
      }
    };

    try {
      await app.start(RedScene);

      await expectFrame('red active', lightmapPasses, red);

      // Preparing the blue scene runs its init(), which builds its lighting -
      // and must leave the red scene's frame alone.
      await app.scenes.preload(BlueScene);

      await expectFrame('blue prepared', lightmapPasses, red);

      // Discarding the preload takes nothing of the red scene's with it.
      await app.scenes.unload(BlueScene);

      await expectFrame('blue preload discarded', lightmapPasses, red);

      // A prepared scene consumed by change(): the red one is retained.
      await app.scenes.preload(BlueScene);
      await app.scenes.change(BlueScene, { suspendCurrent: true });

      await expectFrame('blue active, red retained', lightmapPasses, blue);

      await app.scenes.restore(RedScene, { suspendCurrent: true });

      await expectFrame('red restored, blue retained', lightmapPasses, red);

      await app.scenes.restore(BlueScene, { suspendCurrent: true });

      await expectFrame('blue restored, red retained', lightmapPasses, blue);

      // Destroying the retained red scene leaves the blue one as it is.
      await app.scenes.unload(RedScene);

      await expectFrame('red destroyed', lightmapPasses, blue);

      // Leaving the blue scene for good leaves an empty frame slot behind.
      await app.scenes.change(UnlitScene);

      await expectFrame('unlit active', 0, white);
    } finally {
      await app.destroy();
      container.remove();
    }
  });
});
