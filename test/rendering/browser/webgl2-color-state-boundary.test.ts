/**
 * The GPU helpers the colour pipeline added run inside a frame that is already
 * in progress, so each must hand the context back exactly as it found it. A
 * fake context cannot answer that - it models only the state a test thought of
 * - so this reads the real driver state around a normalization upload.
 */
import { expect, test } from 'vitest';

import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';

const translucentStraightPixels = (): Texture =>
  Texture.fromPixels({
    colorSpace: 'srgb',
    alphaMode: 'straight',
    levels: [{ data: new Uint8Array([200, 100, 50, 128, 10, 20, 30, 64, 255, 255, 255, 255, 0, 0, 0, 0]), width: 2, height: 2 }],
  });

interface RasterSnapshot {
  readonly framebuffer: WebGLFramebuffer | null;
  readonly viewport: readonly number[];
  readonly scissor: readonly number[];
  readonly capabilities: readonly boolean[];
  readonly colorMask: readonly boolean[];
  readonly activeTexture: number;
  readonly unitBindings: ReadonlyArray<WebGLTexture | null>;
  readonly unpack: readonly unknown[];
}

const snapshot = (gl: WebGL2RenderingContext): RasterSnapshot => {
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const unitBindings: Array<WebGLTexture | null> = [];

  for (const unit of [gl.TEXTURE0, gl.TEXTURE2, gl.TEXTURE5]) {
    gl.activeTexture(unit);
    unitBindings.push(gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null);
  }

  gl.activeTexture(activeTexture);

  return {
    framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
    viewport: [...(gl.getParameter(gl.VIEWPORT) as Int32Array)],
    scissor: [...(gl.getParameter(gl.SCISSOR_BOX) as Int32Array)],
    capabilities: [gl.BLEND, gl.SCISSOR_TEST, gl.STENCIL_TEST, gl.DEPTH_TEST, gl.CULL_FACE, gl.DITHER].map(capability =>
      gl.isEnabled(capability),
    ),
    colorMask: [...(gl.getParameter(gl.COLOR_WRITEMASK) as boolean[])],
    activeTexture,
    unitBindings,
    unpack: [
      gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
      gl.getParameter(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL),
      gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
    ],
  };
};

test('a normalization upload inside a live frame leaves the driver state as it found it', async () => {
  const backend = await createWebGl2TestBackend(16);
  const gl = backend.context;
  const target = new RenderTexture(16, 16, { format: TextureFormat.Rgba8Srgb });
  const texture = translucentStraightPixels();
  const markerA = gl.createTexture();
  const markerB = gl.createTexture();

  try {
    backend.setRenderTarget(target);

    // Deliberately unusual live state: a clipped, blended, colour-masked frame
    // with two foreign textures bound on units the pass borrows or must not
    // touch. The viewport is the backend's own, so it is compared, not forced.
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(1, 1, 10, 10);
    gl.enable(gl.BLEND);
    gl.colorMask(true, false, true, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, markerA);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, markerB);

    const before = snapshot(gl);

    backend.bindTexture(texture, 2);

    const after = snapshot(gl);

    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(after.framebuffer).toBe(before.framebuffer);
    expect(after.viewport).toEqual(before.viewport);
    expect(after.scissor).toEqual(before.scissor);
    expect(after.capabilities).toEqual(before.capabilities);
    expect(after.colorMask).toEqual(before.colorMask);
    expect(after.unpack).toEqual(before.unpack);
    // Units 0 and 5 belong to the caller; unit 2 now holds the uploaded texture.
    const [unit0, unit2, unit5] = after.unitBindings;

    expect(unit0).toBe(markerA);
    expect(unit5).toBe(markerB);
    expect(unit2).not.toBeNull();
    expect(unit2).not.toBe(markerA);
    expect(unit2).not.toBe(markerB);
    expect(after.activeTexture).toBe(gl.TEXTURE2);
  } finally {
    gl.deleteTexture(markerA);
    gl.deleteTexture(markerB);
    texture.destroy();
    target.destroy();
    backend.destroy();
  }
});
