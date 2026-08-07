import { MAX_POOLED_RENDER_TEXTURE_BYTES, MAX_POOLED_RENDER_TEXTURES, RenderTexturePool } from '#rendering/RenderTexturePool';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { createFakeCanvas, createFakeWebGl2Context, GlRecorder, installFakeWebGl2Globals } from '../perf/rendering/fakeWebGl2';
import { createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

/** A backend wired to the recording fake GL context — enough for pool bookkeeping, no renderers needed. */
const createFakeWebGl2Backend = (): WebGl2Backend => {
  installFakeWebGl2Globals();

  const context = createFakeWebGl2Context(new GlRecorder());
  const canvas = createFakeCanvas(256, 256, context);

  return new WebGl2Backend({
    canvas,
    options: { canvas: { width: 256, height: 256 }, rendering: { debug: false }, clearColor: undefined },
  } as unknown as ConstructorParameters<typeof WebGl2Backend>[0]);
};

describe('RenderTexturePool', () => {
  test('hands back an exact size match and allocates for anything else', () => {
    const pool = new RenderTexturePool();
    const released = new RenderTexture(64, 32);

    pool.release(released);

    expect(pool.acquire(48, 48)).not.toBe(released);
    expect(pool.acquire(64, 32)).toBe(released);
    expect(pool.size).toBe(0);
  });

  test('releasing the same texture twice pools it once', () => {
    const pool = new RenderTexturePool();
    const texture = new RenderTexture(64, 64);

    pool.release(texture);
    pool.release(texture);

    expect(pool.size).toBe(1);
  });

  test('caps the entry count and destroys the least recently released entries', () => {
    const pool = new RenderTexturePool();
    const released: RenderTexture[] = [];

    for (let index = 0; index < MAX_POOLED_RENDER_TEXTURES * 4; index++) {
      const texture = new RenderTexture(16, 16);

      released.push(texture);
      pool.release(texture);
    }

    const live = released.filter(texture => !texture.destroyed);

    expect(pool.size).toBe(MAX_POOLED_RENDER_TEXTURES);
    expect(live).toHaveLength(MAX_POOLED_RENDER_TEXTURES);
    // Least recently released go first, so the survivors are the newest entries.
    expect(live).toEqual(released.slice(-MAX_POOLED_RENDER_TEXTURES));
  });

  test('caps the pooled byte budget when the entries are large', () => {
    const pool = new RenderTexturePool();
    // 1024×1024 rgba8 = 4 MiB each, so the byte budget bites well before the count cap.
    const perTextureBytes = 1024 * 1024 * 4;
    const expectedSurvivors = Math.floor(MAX_POOLED_RENDER_TEXTURE_BYTES / perTextureBytes);

    expect(expectedSurvivors).toBeLessThan(MAX_POOLED_RENDER_TEXTURES);

    for (let index = 0; index < MAX_POOLED_RENDER_TEXTURES; index++) {
      pool.release(new RenderTexture(1024, 1024));
    }

    expect(pool.size).toBe(expectedSurvivors);
    expect(pool.bytes).toBeLessThanOrEqual(MAX_POOLED_RENDER_TEXTURE_BYTES);
  });

  test('accounts float formats at their real cost', () => {
    const pool = new RenderTexturePool();

    pool.release(new RenderTexture(256, 256, { format: TextureFormat.Rgba32F }));

    expect(pool.bytes).toBe(256 * 256 * 16);
  });

  test('never pools an already destroyed texture', () => {
    const pool = new RenderTexturePool();
    const texture = new RenderTexture(64, 64);

    texture.destroy();
    pool.release(texture);

    expect(pool.size).toBe(0);
    expect(pool.acquire(64, 64)).not.toBe(texture);
  });

  test('destroy releases every pooled texture; forget drops them untouched', () => {
    const destroyed = new RenderTexturePool();
    const forgotten = new RenderTexturePool();
    const owned = new RenderTexture(64, 64);
    const orphaned = new RenderTexture(64, 64);

    destroyed.release(owned);
    forgotten.release(orphaned);

    destroyed.destroy();
    forgotten.forget();

    expect(destroyed.size).toBe(0);
    expect(owned.destroyed).toBe(true);
    expect(forgotten.size).toBe(0);
    expect(orphaned.destroyed).toBe(false);

    orphaned.destroy();
  });
});

describe('WebGl2Backend render texture pool', () => {
  test('stays bounded when many same-size textures are released', () => {
    const backend = createFakeWebGl2Backend();
    const released: RenderTexture[] = [];

    // Hold them all at once — an animated filter whose bounds resize every frame
    // hands back far more textures than it ever re-acquires at a given size.
    for (let index = 0; index < MAX_POOLED_RENDER_TEXTURES * 8; index++) {
      released.push(backend.acquireRenderTexture(32, 32));
    }

    for (const texture of released) {
      backend.releaseRenderTexture(texture);
    }

    const live = released.filter(texture => !texture.destroyed);

    expect(live).toHaveLength(MAX_POOLED_RENDER_TEXTURES);
    // Eviction must free GPU state, not just drop the reference.
    expect(released.filter(texture => texture.destroyed)).toHaveLength(MAX_POOLED_RENDER_TEXTURES * 7);

    // A pooled texture is still reused, and an evicted one is never handed back.
    const reacquired = backend.acquireRenderTexture(32, 32);

    expect(reacquired.destroyed).toBe(false);
    expect(live).toContain(reacquired);

    backend.destroy();
  });
});

describe('WebGpuBackend render texture pool', () => {
  test('stays bounded when many same-size textures are released', async () => {
    const backend = await createMockBackend(createMockWebGpuEnvironment());
    const released: RenderTexture[] = [];

    for (let index = 0; index < MAX_POOLED_RENDER_TEXTURES * 8; index++) {
      released.push(backend.acquireRenderTexture(32, 32));
    }

    for (const texture of released) {
      backend.releaseRenderTexture(texture);
    }

    const live = released.filter(texture => !texture.destroyed);

    expect(live).toHaveLength(MAX_POOLED_RENDER_TEXTURES);
    expect(released.filter(texture => texture.destroyed)).toHaveLength(MAX_POOLED_RENDER_TEXTURES * 7);

    const reacquired = backend.acquireRenderTexture(32, 32);

    expect(reacquired.destroyed).toBe(false);
    expect(live).toContain(reacquired);

    backend.destroy();
  });
});
