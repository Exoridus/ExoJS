/**
 * Colour-format propagation through the effect executor's own scratch and
 * cache surfaces: a filtered, cached or masked node's intermediate colour
 * textures have to carry the same colour format as the target they will
 * ultimately be composited back into, not always the pool's Rgba8 default -
 * otherwise a scene rendered into a non-default format (sRGB, float) would
 * silently lose it mid-chain. Coverage masks are the one exception: they stay
 * raw Rgba8 regardless, since they carry no colour of their own.
 */

import { Color } from '#core/Color';
import { Filter } from '#rendering/filters/Filter';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderBackend } from '#rendering/RenderBackend';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';

class RecordingFilter extends Filter {
  public readonly outputs: RenderTexture[] = [];

  public override apply(_backend: RenderBackend, _input: RenderTexture, output: RenderTexture): void {
    this.outputs.push(output);
  }
}

const createTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

interface ComposeCall {
  content: Texture | RenderTexture;
  mask: Texture | RenderTexture;
}

/** A backend double whose active render target can be swapped mid-test. */
const createRuntime = () => {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const composeCalls: ComposeCall[] = [];

  const runtime: RenderBackend = {
    ...createRenderBackendDouble({ renderTarget: root, stats: createRenderStats() }),
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return currentTarget.view;
    },
    setRenderTarget(target) {
      currentTarget = target ?? root;

      return this;
    },
    setView(view) {
      currentTarget.setView(view);

      return this;
    },
    composeWithAlphaMask(content, mask) {
      composeCalls.push({ content, mask });

      return this;
    },
    execute(pass) {
      // Synchronous so a node's intermediate render-to-texture write is
      // visible to the assertions that follow.
      pass.execute(this);

      return this;
    },
  };

  return { runtime, composeCalls, setTarget: (target: RenderTarget) => (currentTarget = target) };
};

describe('effect executor colour-format propagation', () => {
  test('a filter chain acquires its scratch output in the active target colour format', () => {
    const { runtime } = createRuntime();
    const target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });

    runtime.setRenderTarget(target);

    const texture = createTexture();
    const drawable = new Sprite(texture);
    const filter = new RecordingFilter();

    drawable.addFilter(filter);
    drawable.render(runtime);

    expect(filter.outputs).toHaveLength(1);
    expect(filter.outputs[0]!.format).toBe(TextureFormat.Rgba8Srgb);

    drawable.destroy();
    texture.destroy();
    target.destroy();
  });

  test('a filter chain into the default (canvas) target still gets plain Rgba8 scratch', () => {
    const { runtime } = createRuntime();
    const texture = createTexture();
    const drawable = new Sprite(texture);
    const filter = new RecordingFilter();

    drawable.addFilter(filter);
    drawable.render(runtime);

    expect(filter.outputs[0]!.format).toBe(TextureFormat.Rgba8);

    drawable.destroy();
    texture.destroy();
  });

  test('a cached node backing texture inherits the active target colour format', () => {
    const { runtime } = createRuntime();
    const target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });

    runtime.setRenderTarget(target);

    const texture = createTexture();
    const drawable = new Sprite(texture);

    drawable.cacheAsTexture = true;
    drawable.render(runtime);

    const cached = drawable._renderPlanGetCacheTexture();

    expect(cached).not.toBeNull();
    expect(cached!.format).toBe(TextureFormat.Rgba8Srgb);

    drawable.destroy();
    texture.destroy();
    target.destroy();
  });

  test('a colour-format change replaces the cached texture instead of resizing it in place', () => {
    const { runtime } = createRuntime();
    const srgbTarget = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });
    const floatTarget = new RenderTexture(64, 48, { format: TextureFormat.Rgba16F });
    const texture = createTexture();
    const drawable = new Sprite(texture);

    drawable.cacheAsTexture = true;

    runtime.setRenderTarget(srgbTarget);
    drawable.render(runtime);
    const firstCache = drawable._renderPlanGetCacheTexture();

    expect(firstCache!.format).toBe(TextureFormat.Rgba8Srgb);

    drawable.invalidateCache();
    runtime.setRenderTarget(floatTarget);
    drawable.render(runtime);
    const secondCache = drawable._renderPlanGetCacheTexture();

    expect(secondCache!.format).toBe(TextureFormat.Rgba16F);
    // Same dimensions, different format: a format change must not reuse the
    // old GPU object by resizing it in place.
    expect(secondCache).not.toBe(firstCache);
    expect(firstCache!.destroyed).toBe(true);

    drawable.destroy();
    texture.destroy();
    srgbTarget.destroy();
    floatTarget.destroy();
  });

  test('a node-mask content surface inherits the working colour format while the mask coverage surface stays Rgba8', () => {
    const { runtime, composeCalls } = createRuntime();
    const target = new RenderTexture(64, 48, { format: TextureFormat.Rgba8Srgb });

    runtime.setRenderTarget(target);

    const texture = createTexture();
    const drawable = new Sprite(texture);
    const maskGraphics = new Graphics();

    maskGraphics.fillColor = Color.white;
    maskGraphics.drawRectangle(0, 0, 32, 24);
    drawable.mask = maskGraphics;
    drawable.render(runtime);

    expect(composeCalls).toHaveLength(1);
    const call = composeCalls[0]!;

    expect(call.content).toBeInstanceOf(RenderTexture);
    expect((call.content as RenderTexture).format).toBe(TextureFormat.Rgba8Srgb);
    expect(call.mask).toBeInstanceOf(RenderTexture);
    expect((call.mask as RenderTexture).format).toBe(TextureFormat.Rgba8);

    drawable.destroy();
    texture.destroy();
    maskGraphics.destroy();
    target.destroy();
  });
});
