/**
 * WebGl2Backend — context-loss / restore handle-invalidation bookkeeping (B-09).
 *
 * These run in Node against the recording fake WebGL2 context (see
 * `harness.ts`), driving the REAL backend + renderers. They assert the
 * device-state teardown/rebuild bookkeeping that a real `webglcontextrestored`
 * triggers — the part the previous implementation skipped, leaving dangling GL
 * handles after a genuine GPU reset.
 *
 * The browser lane (`test/rendering/browser/webgl2-context-restore.test.ts`)
 * proves the same recovery end-to-end with real pixels via WEBGL_lose_context;
 * this lane pins the CPU-side cache invalidation deterministically.
 */
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';

import { buildSpriteScene, makeTexture } from './fixtures';
import { createWebGl2Harness, measureFrame, type WebGl2Harness } from './harness';

interface ManagedTextureState {
  readonly handle: object;
}

// Private surface we assert against — the caches a real restore must evict and
// rebuild. Reached via a typed cast rather than `any` so the shape stays honest.
interface BackendInternals {
  _contextLost: boolean;
  readonly _textureStates: Map<Texture | RenderTexture, ManagedTextureState>;
  readonly _renderTargetStates: Map<object, object>;
  _onContextLost(event: Event): void;
  _onContextRestored(): void;
}

const internals = (harness: WebGl2Harness): BackendInternals => harness.backend as unknown as BackendInternals;

describe('WebGl2Backend: real context-restore handle invalidation (B-09)', () => {
  test('webglcontextlost cancels the default so the browser can restore', () => {
    const harness = createWebGl2Harness();

    try {
      const preventDefault = vi.fn();

      internals(harness)._onContextLost({ preventDefault } as unknown as Event);

      // Without preventDefault() the browser never fires webglcontextrestored
      // and the canvas stays permanently blank after a real GPU reset.
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(internals(harness)._contextLost).toBe(true);
    } finally {
      harness.destroy();
    }
  });

  test('restore evicts every cached texture / render-target handle', () => {
    const harness = createWebGl2Harness();

    try {
      const texture = makeTexture(64);
      const { root } = buildSpriteScene({ count: 4, textures: [texture] });

      measureFrame(harness, root);

      const back = internals(harness);
      const rootTarget = harness.backend.renderTarget as unknown as object;
      const rootStateBefore = back._renderTargetStates.get(rootTarget);

      // A rendered frame populated the texture cache (content texture +
      // shared transform DataTexture) and the root render-target state.
      expect(back._textureStates.size).toBeGreaterThan(0);
      expect(rootStateBefore).toBeDefined();

      back._onContextRestored();

      // Every content texture handle is dropped; the texture cache repopulates
      // lazily on the next draw against the fresh context.
      expect(back._contextLost).toBe(false);
      expect(back._textureStates.size).toBe(0);

      // The render-target cache was evicted too — the root target is then
      // immediately re-bound so the next frame can draw, but with a BRAND-NEW
      // state object (fresh framebuffer binding), never the dead one.
      const rootStateAfter = back._renderTargetStates.get(rootTarget);

      expect(rootStateAfter).toBeDefined();
      expect(rootStateAfter).not.toBe(rootStateBefore);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });

  test('the same Texture gets a fresh GL handle after restore (no stale handle reuse)', () => {
    const harness = createWebGl2Harness();

    try {
      const texture = makeTexture(64);
      const { root } = buildSpriteScene({ count: 1, textures: [texture] });
      const back = internals(harness);

      measureFrame(harness, root);
      const handleBefore = back._textureStates.get(texture)?.handle;

      expect(handleBefore).toBeDefined();

      back._onContextRestored();
      measureFrame(harness, root);
      const handleAfter = back._textureStates.get(texture)?.handle;

      expect(handleAfter).toBeDefined();
      // A distinct fake handle object proves the dead one was not reused.
      expect(handleAfter).not.toBe(handleBefore);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });

  test('rendering resumes after restore — draw calls are issued against the rebuilt device', () => {
    const harness = createWebGl2Harness();

    try {
      const texture = makeTexture(64);
      const { root } = buildSpriteScene({ count: 8, textures: [texture] });
      const back = internals(harness);

      const before = measureFrame(harness, root);

      expect(before.drawCalls).toBeGreaterThan(0);

      // Simulate a full real lose → restore cycle.
      back._onContextLost({ preventDefault: vi.fn() } as unknown as Event);
      back._onContextRestored();

      // The renderers reconnected (fresh buffers / VAOs / shader programs), so
      // the very next frame draws exactly as before — not a blank canvas.
      const after = measureFrame(harness, root);

      expect(after.drawCalls).toBe(before.drawCalls);
      expect(after.batches).toBe(before.batches);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });

  test('GPU memory accounting is released on restore and re-accrued on next draw', () => {
    const harness = createWebGl2Harness();

    try {
      const texture = makeTexture(64);
      const { root } = buildSpriteScene({ count: 4, textures: [texture] });
      const back = internals(harness);
      const stats = harness.backend.stats;

      measureFrame(harness, root);
      const bytesLive = stats.gpuMemoryBytes;

      expect(bytesLive).toBeGreaterThan(0);

      back._onContextRestored();

      // Eviction freed the dead resources' accounted bytes; the renderers'
      // reconnect immediately re-books their buffer allocations, so the total
      // is non-negative and the caches are consistent (no double-count).
      expect(stats.gpuMemoryBytes).toBeGreaterThanOrEqual(0);
      expect(stats.gpuMemoryBytes).toBeLessThanOrEqual(bytesLive);

      // Next frame re-accrues the content-texture / transform-texture storage.
      measureFrame(harness, root);
      expect(stats.gpuMemoryBytes).toBeGreaterThan(0);

      root.destroy();
    } finally {
      harness.destroy();
    }
  });
});
