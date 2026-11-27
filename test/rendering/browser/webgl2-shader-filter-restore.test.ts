import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { ShaderFilter } from '#rendering/filters/ShaderFilter';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const identityFragment = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() {
    fragColor = texture(uTexture, vUv);
}
`;

describe('WebGL2 ShaderFilter context restoration', () => {
  test('rebuilds the same filter across two real context restores', async ({ onTestFinished }) => {
    const backend = await createWebGl2TestBackend(8);
    const input = new RenderTexture(8, 8);
    const output = new RenderTexture(8, 8);
    const filter = new ShaderFilter({ glsl: { fragment: identityFragment } });
    const gl = backend.context;
    const canvas = gl.canvas as HTMLCanvasElement;
    const extension = gl.getExtension('WEBGL_lose_context');

    onTestFinished(() => {
      filter.destroy();
      backend.setRenderTarget(null);
      input.destroy();
      output.destroy();
      backend.destroy();
    });

    expect(extension).not.toBeNull();

    const render = (color: Color, expected: readonly [number, number, number, number]): void => {
      // RenderTexture storage is lost too; refill it before testing the surviving filter.
      backend.setRenderTarget(input).clear(color);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), expected, 1);
      backend.setBlendMode(BlendModes.Normal);
      filter.apply(backend, input, output);
      backend.setRenderTarget(output);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), expected, 1);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    };

    render(new Color(200, 100, 40), [200, 100, 40, 255]);

    for (let cycle = 0; cycle < 2; cycle++) {
      const events: string[] = [];

      const lost = (): void => {
        events.push('lost');
      };

      const rawLost = (): void => {
        events.push('raw-lost');
      };

      let rawReady!: () => void;
      const rawComplete = new Promise<void>(resolve => {
        rawReady = resolve;
      });

      const rawRestored = (): void => {
        events.push('raw-restored');
        rawReady();
      };

      let ready!: () => void;

      const restored = (): void => {
        events.push('ready');
        ready();
      };

      const complete = new Promise<void>(resolve => {
        ready = resolve;
      });

      const cleanup = (): void => {
        backend.onContextLost.remove(lost);
        backend.onContextRestored.remove(restored);
        canvas.removeEventListener('webglcontextlost', rawLost);
        canvas.removeEventListener('webglcontextrestored', rawRestored);
      };

      onTestFinished(cleanup);
      backend.onContextLost.add(lost);
      backend.onContextRestored.add(restored);
      canvas.addEventListener('webglcontextlost', rawLost);
      canvas.addEventListener('webglcontextrestored', rawRestored);
      extension!.loseContext();
      await Promise.all([complete, rawComplete]);
      cleanup();

      expect(events).toEqual(['lost', 'raw-lost', 'ready', 'raw-restored']);
      expect(gl.isContextLost()).toBe(false);
      render(new Color(40, 80, 120, 0.5), [40, 80, 120, 128]);
    }
  });
});
