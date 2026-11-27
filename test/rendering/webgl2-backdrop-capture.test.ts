import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';
import { WebGl2BackdropBlendCompositor } from '#rendering/webgl2/WebGl2BackdropBlendCompositor';
import type { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';

test.each([true, false])('backdrop capture uses storage pixels (root=%s)', root => {
  installFakeWebGl2Globals();
  const gl = createFakeWebGl2Context(new GlRecorder());
  const target = root ? new RenderTarget(64, 64, true) : new RenderTexture(128, 128);
  const source = new RenderTexture(16, 20);

  target.view.reset(32, 32, 64, 64);
  Object.defineProperties(gl, { drawingBufferWidth: { value: 128 }, drawingBufferHeight: { value: 128 } });
  const blit = vi.spyOn(gl, 'blitFramebuffer');
  const acquire = vi.fn((width: number, height: number) => new RenderTexture(width, height));
  const backend = {
    context: gl,
    renderTarget: target,
    view: target.view,
    _snapViewport: { x: 0, y: 0, width: 128, height: 128 },
    acquireRenderTexture: acquire,
    releaseRenderTexture: (texture: RenderTexture) => texture.destroy(),
    _renderTargetFramebuffer: () => null,
    _rebindActiveTarget() {},
    _effectiveSampleCount: () => 1,
  } as unknown as WebGl2Backend;
  const compositor = new WebGl2BackdropBlendCompositor();
  const internals = compositor as unknown as { _connection: object; _drawBlend(): void };

  internals._connection = {};
  vi.spyOn(internals, '_drawBlend').mockImplementation(() => {});
  compositor.compose(backend, source, 8, 10, 16, 20, BlendModes.Darken);
  expect(acquire).toHaveBeenCalledWith(32, 40, expect.anything());
  expect(blit).toHaveBeenCalledWith(16, 68, 48, 108, 0, root ? 0 : 40, 32, root ? 40 : 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  target.destroy();
  source.destroy();
});
