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

describe('WebGL2 ShaderFilter blend isolation', () => {
  for (const [name, blendMode] of [
    ['Normal', BlendModes.Normal],
    ['Multiply', BlendModes.Multiply],
    ['Subtract', BlendModes.Subtract],
  ] as const) {
    for (const alpha of [1, 0.5, 0]) {
      test(`preserves identity pixels after ${name} blending with alpha ${alpha}`, async () => {
        const backend = await createWebGl2TestBackend(8);
        const input = new RenderTexture(8, 8);
        const output = new RenderTexture(8, 8);
        const filter = new ShaderFilter({ glsl: { fragment: identityFragment } });

        try {
          backend.setRenderTarget(input);
          // Raw RGBA8 attachments store the clear channels verbatim, so premultiply them.
          backend.clear(new Color(200 * alpha, 100 * alpha, 40 * alpha, alpha));

          const expected = readWebGl2Pixel(backend, 4, 4);

          expectPixelNear(expected, [200 * alpha, 100 * alpha, 40 * alpha, Math.round(255 * alpha)], 1);

          // Reapplying the predecessor also exercises the backend's blend cache.
          for (let application = 0; application < 2; application++) {
            backend.setBlendMode(blendMode);
            filter.apply(backend, input, output);
            backend.setRenderTarget(output);

            expectPixelNear(readWebGl2Pixel(backend, 4, 4), expected, 1);
            expect(backend.context.getError()).toBe(backend.context.NO_ERROR);
          }
        } finally {
          filter.destroy();
          backend.setRenderTarget(null);
          input.destroy();
          output.destroy();
          backend.destroy();
        }
      });
    }
  }
});
