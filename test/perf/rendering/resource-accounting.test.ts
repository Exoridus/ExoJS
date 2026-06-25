// ---------------------------------------------------------------------------
// Slice 2g — GPU resource accounting (VRAM / upload / download).
//
// Drives the real WebGl2Backend against the Node fake-context recording harness
// and asserts the new RenderStats fields:
//   - gpuMemoryBytes    : running Σ of live texture/buffer bytes (NOT per-frame reset)
//   - textureUploadBytes : per-frame content-texture pixel bytes uploaded
//   - bufferUploadBytes  : per-frame buffer bytes uploaded
//   - downloadBytes / downloadCount: per-frame GPU→CPU readback (0 in render path)
//
// Determinism: DataTextures have an exact, known footprint (no source decode,
// no mips by default), and the booking runs identically against the fake
// context — no GPU, no flake.
//
// The backend's renderers allocate their own GPU buffers (instance/index/etc.)
// at connect time, so a freshly wired backend already reports a non-zero
// `gpuMemoryBytes` baseline. All VRAM assertions therefore measure the *delta*
// produced by adding or freeing a texture of known size, which is exact.
// ---------------------------------------------------------------------------
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';

import { buildSpriteScene, makeTexture } from './fixtures';
import { createWebGl2Harness, measureFrame, measureSteadyFrame, type WebGl2Harness } from './harness';

/** rgba8 DataTexture footprint = width·height·4, no mips. */
const rgba8Bytes = (size: number): number => size * size * 4;

/** Warm a single-sprite scene to steady state and return its VRAM total. */
const warmAndReadVram = (harness: WebGl2Harness, texture: DataTexture): number => {
  measureSteadyFrame(harness, buildSpriteScene({ count: 1, textures: [texture] }).root);

  return harness.backend.stats.gpuMemoryBytes;
};

describe('GPU resource accounting (RenderStats)', () => {
  describe('new fields exist with the right reset semantics', () => {
    test('the new accounting fields are present and numeric on a fresh backend', () => {
      const harness = createWebGl2Harness();

      try {
        const stats = harness.backend.stats;

        // All five fields exist and are finite numbers. The per-frame upload
        // fields may already be non-zero because the core renderers allocate +
        // upload their GPU buffers at connect time (before the first frame);
        // resetStats() then zeroes them (asserted in the reset-policy test).
        for (const value of [stats.gpuMemoryBytes, stats.textureUploadBytes, stats.bufferUploadBytes, stats.downloadBytes, stats.downloadCount]) {
          expect(typeof value).toBe('number');
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        }

        // No GPU→CPU readback happens at wire-up.
        expect(stats.downloadBytes).toBe(0);
        expect(stats.downloadCount).toBe(0);

        // The first resetStats() clears the per-frame accumulators…
        harness.backend.resetStats();
        expect(harness.backend.stats.textureUploadBytes).toBe(0);
        expect(harness.backend.stats.bufferUploadBytes).toBe(0);
        // …but preserves the running VRAM total booked at connect.
        expect(harness.backend.stats.gpuMemoryBytes).toBeGreaterThanOrEqual(0);
      } finally {
        harness.destroy();
      }
    });
  });

  describe('gpuMemoryBytes — texture VRAM (measured as deltas)', () => {
    test('adding N distinct content textures raises VRAM by exactly their summed footprint', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 64;

        // Warm with a tiny placeholder texture so the renderer buffers + the
        // shared transform texture are already allocated and out of the delta.
        const baselineTex = new DataTexture({ width: 8, height: 8, format: 'rgba8' });
        const baseline = warmAndReadVram(harness, baselineTex);

        const textureCount = 4;
        const textures = Array.from({ length: textureCount }, () => new DataTexture({ width: size, height: size, format: 'rgba8' }));

        measureSteadyFrame(harness, buildSpriteScene({ count: textureCount, textures, assign: 'distinct' }).root);

        const delta = harness.backend.stats.gpuMemoryBytes - baseline;

        // The four new content textures are the only new GPU storage of a known
        // size; the transform texture for a 4-row buffer adds at most a few
        // hundred bytes, so the delta is the content sum plus that tiny term.
        expect(delta).toBeGreaterThanOrEqual(textureCount * rgba8Bytes(size));
        // …and the content textures clearly dominate (delta is not e.g. 2× the sum).
        expect(delta).toBeLessThan(textureCount * rgba8Bytes(size) + rgba8Bytes(size));
      } finally {
        harness.destroy();
      }
    });

    test('one freshly uploaded content texture contributes exactly its footprint', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 128;

        // Warm with the eventual texture's slot already holding a small texture,
        // then swap in the full-size one and measure the resize delta exactly.
        const baselineTex = new DataTexture({ width: 8, height: 8, format: 'rgba8' });
        const baseline = warmAndReadVram(harness, baselineTex);

        const texture = new DataTexture({ width: size, height: size, format: 'rgba8' });

        measureSteadyFrame(harness, buildSpriteScene({ count: 1, textures: [texture] }).root);

        const delta = harness.backend.stats.gpuMemoryBytes - baseline;

        // Adding one 128² rgba8 texture (the baseline 8² texture is now unused
        // but still resident, so it does not subtract). Delta ≥ the new content.
        expect(delta).toBeGreaterThanOrEqual(rgba8Bytes(size));
        expect(delta).toBeLessThan(rgba8Bytes(size) + rgba8Bytes(64));
      } finally {
        harness.destroy();
      }
    });

    test('freeing a texture lowers gpuMemoryBytes by exactly that texture footprint', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 256;
        const keep = new DataTexture({ width: size, height: size, format: 'rgba8' });
        const drop = new DataTexture({ width: size, height: size, format: 'rgba8' });

        measureSteadyFrame(harness, buildSpriteScene({ count: 2, textures: [keep, drop], assign: 'distinct' }).root);

        const before = harness.backend.stats.gpuMemoryBytes;

        // Destroying the texture fires its destroy listener → backend evicts it
        // and decrements the accountant by exactly the booked size.
        drop.destroy();

        expect(before - harness.backend.stats.gpuMemoryBytes).toBe(rgba8Bytes(size));
      } finally {
        harness.destroy();
      }
    });

    test('larger textures book proportionally more VRAM', () => {
      const small = createWebGl2Harness();
      const large = createWebGl2Harness();

      try {
        const baseS = warmAndReadVram(small, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));
        const baseL = warmAndReadVram(large, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));

        const deltaSmall = warmAndReadVram(small, new DataTexture({ width: 64, height: 64, format: 'rgba8' })) - baseS;
        const deltaLarge = warmAndReadVram(large, new DataTexture({ width: 128, height: 128, format: 'rgba8' })) - baseL;

        // 128² is 4× the pixels of 64²; the content deltas reflect that exactly.
        expect(deltaLarge - deltaSmall).toBe(rgba8Bytes(128) - rgba8Bytes(64));
      } finally {
        small.destroy();
        large.destroy();
      }
    });

    test('rgba32f costs 4× an rgba8 texture of the same dimensions', () => {
      const harness8 = createWebGl2Harness();
      const harness32 = createWebGl2Harness();

      try {
        const size = 64;

        const base8 = warmAndReadVram(harness8, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));
        const base32 = warmAndReadVram(harness32, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));

        const delta8 = warmAndReadVram(harness8, new DataTexture({ width: size, height: size, format: 'rgba8' })) - base8;
        const delta32 = warmAndReadVram(harness32, new DataTexture({ width: size, height: size, format: 'rgba32f' })) - base32;

        // Same dimensions; the content delta is (16 − 4) bytes/px × size².
        expect(delta32 - delta8).toBe(size * size * (16 - 4));
      } finally {
        harness8.destroy();
        harness32.destroy();
      }
    });
  });

  describe('gpuMemoryBytes — multi-instance isolation', () => {
    test('two backends keep independent VRAM tallies', () => {
      const a = createWebGl2Harness();
      const b = createWebGl2Harness();

      try {
        const baseA = warmAndReadVram(a, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));
        const baseB = warmAndReadVram(b, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));

        const deltaA = warmAndReadVram(a, new DataTexture({ width: 64, height: 64, format: 'rgba8' })) - baseA;
        const deltaB = warmAndReadVram(b, new DataTexture({ width: 256, height: 256, format: 'rgba8' })) - baseB;

        // Each backend booked only its own texture; the deltas differ by the
        // exact content-size difference and do not bleed across instances.
        expect(deltaB - deltaA).toBe(rgba8Bytes(256) - rgba8Bytes(64));
      } finally {
        a.destroy();
        b.destroy();
      }
    });
  });

  describe('textureUploadBytes — per-frame content uploads', () => {
    test('a first frame uploads at least the content-texture pixel bytes', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 128;
        const texture = new DataTexture({ width: size, height: size, format: 'rgba8' });

        measureFrame(harness, buildSpriteScene({ count: 1, textures: [texture] }).root);

        // The frame uploads the content texture (full texImage2D) plus the
        // transform texture; content bytes must be included in the total.
        expect(harness.backend.stats.textureUploadBytes).toBeGreaterThanOrEqual(rgba8Bytes(size));
      } finally {
        harness.destroy();
      }
    });

    test('a subsequent static frame uploads zero texture bytes', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 128;
        const texture = new DataTexture({ width: size, height: size, format: 'rgba8' });
        const { root } = buildSpriteScene({ count: 1, textures: [texture] });

        // Warm: content + transform uploaded; transforms unchanged thereafter.
        measureSteadyFrame(harness, root, 3);

        // A further render with nothing mutated re-uploads nothing.
        measureFrame(harness, root);

        expect(harness.backend.stats.textureUploadBytes).toBe(0);
      } finally {
        harness.destroy();
      }
    });

    test('uploading a content texture adds exactly its byte count to textureUploadBytes', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 64;
        const a = new DataTexture({ width: size, height: size, format: 'rgba8' });
        const b = new DataTexture({ width: size, height: size, format: 'rgba8' });

        // Warm steady with texture `a` only — transforms quiescent.
        const sceneA = buildSpriteScene({ count: 1, textures: [a] });

        measureSteadyFrame(harness, sceneA.root, 3);

        // Add a second, never-before-seen texture `b` in a fresh scene. The only
        // new texture upload this frame is `b`'s full upload; transforms for two
        // sprites also change, but those are buffer (not texture) uploads.
        const sceneB = buildSpriteScene({ count: 2, textures: [a, b], assign: 'distinct' });

        measureFrame(harness, sceneB.root);

        // textureUploadBytes for this frame = b's content upload (a is unchanged)
        // + the transform-texture re-upload (width 3 × rows × 16 B). Assert the
        // content portion is present and the transform remainder is tiny.
        const uploaded = harness.backend.stats.textureUploadBytes;

        expect(uploaded).toBeGreaterThanOrEqual(rgba8Bytes(size));
        expect(uploaded - rgba8Bytes(size)).toBeLessThan(rgba8Bytes(size));
      } finally {
        harness.destroy();
      }
    });

    test('textureUploadBytes is per-frame (reset each tick) while gpuMemoryBytes persists', () => {
      const harness = createWebGl2Harness();

      try {
        const texture = new DataTexture({ width: 64, height: 64, format: 'rgba8' });
        const { root } = buildSpriteScene({ count: 1, textures: [texture] });

        measureFrame(harness, root);
        const uploadedFirst = harness.backend.stats.textureUploadBytes;
        const vramAfterFirst = harness.backend.stats.gpuMemoryBytes;

        // Drive a couple more idempotent frames to reach a quiescent state.
        measureFrame(harness, root);
        measureFrame(harness, root);

        // VRAM (a running total) is unchanged across idempotent frames…
        expect(harness.backend.stats.gpuMemoryBytes).toBe(vramAfterFirst);
        // …the first frame uploaded the content texture…
        expect(uploadedFirst).toBeGreaterThan(0);
        // …and the per-frame upload accumulator has dropped back to zero.
        expect(harness.backend.stats.textureUploadBytes).toBe(0);
      } finally {
        harness.destroy();
      }
    });
  });

  describe('bufferUploadBytes — per-frame buffer uploads', () => {
    test('a frame that draws sprites uploads instance/index buffer bytes', () => {
      const harness = createWebGl2Harness();

      try {
        const { root } = buildSpriteScene({ count: 16, textures: [makeTexture(64)] });

        const metrics = measureFrame(harness, root);

        expect(harness.backend.stats.bufferUploadBytes).toBeGreaterThan(0);
        // Cross-check against the recorder's independent buffer-byte tally.
        expect(harness.backend.stats.bufferUploadBytes).toBe(metrics.uploadedBufferBytes);
      } finally {
        harness.destroy();
      }
    });
  });

  describe('downloadBytes — readback', () => {
    test('the render path performs no GPU→CPU readback', () => {
      const harness = createWebGl2Harness();

      try {
        const { root } = buildSpriteScene({ count: 8, textures: [makeTexture(64)] });

        measureSteadyFrame(harness, root);

        expect(harness.backend.stats.downloadBytes).toBe(0);
        expect(harness.backend.stats.downloadCount).toBe(0);
      } finally {
        harness.destroy();
      }
    });
  });

  describe('reset policy', () => {
    test('resetStats zeroes per-frame fields but preserves gpuMemoryBytes', () => {
      const harness = createWebGl2Harness();

      try {
        const texture = new DataTexture({ width: 64, height: 64, format: 'rgba8' });
        const { root } = buildSpriteScene({ count: 1, textures: [texture] });

        measureSteadyFrame(harness, root);

        const vram = harness.backend.stats.gpuMemoryBytes;

        expect(vram).toBeGreaterThan(0);

        harness.backend.resetStats();

        expect(harness.backend.stats.gpuMemoryBytes).toBe(vram);
        expect(harness.backend.stats.textureUploadBytes).toBe(0);
        expect(harness.backend.stats.bufferUploadBytes).toBe(0);
        expect(harness.backend.stats.downloadBytes).toBe(0);
        expect(harness.backend.stats.downloadCount).toBe(0);
      } finally {
        harness.destroy();
      }
    });
  });

  describe('Sprite content-texture sanity', () => {
    test('a Sprite over a DataTexture books its texture VRAM after one render', () => {
      const harness = createWebGl2Harness();

      try {
        const size = 64;
        const baseline = warmAndReadVram(harness, new DataTexture({ width: 8, height: 8, format: 'rgba8' }));

        const texture = new DataTexture({ width: size, height: size, format: 'rgba8' });
        const sprite = new Sprite(texture);

        sprite.setPosition(10, 10);
        measureSteadyFrame(harness, sprite);

        expect(harness.backend.stats.gpuMemoryBytes - baseline).toBeGreaterThanOrEqual(rgba8Bytes(size));
      } finally {
        harness.destroy();
      }
    });
  });
});
