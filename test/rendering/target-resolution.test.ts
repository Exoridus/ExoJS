import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';
import { clampResolutionToTextureSize, resolveBarrierResolution, targetTexels } from '#rendering/plan/targetResolution';

/**
 * Resolution policy for internal render targets (`NEU-S4`).
 *
 * These pin the arithmetic; that the policy actually reaches the allocated
 * texture is a browser-lane concern and lives in
 * `browser/webgl2-effect-target-resolution.test.ts`, where a real surface with
 * a pixel ratio exists.
 */

const noFilters: readonly Filter[] = [];

const withResolution = <T extends Filter>(filter: T, resolution: number | 'inherit'): T => {
  filter.resolution = resolution;

  return filter;
};

describe('resolveBarrierResolution', () => {
  test('a filter inherits the enclosing target resolution by default', () => {
    expect(resolveBarrierResolution(2, { cacheAsTexture: false, cacheResolution: 'inherit', filters: [new ColorMatrixFilter()] })).toBe(2);
    expect(resolveBarrierResolution(3, { cacheAsTexture: false, cacheResolution: 'inherit', filters: [new ColorMatrixFilter()] })).toBe(3);
  });

  test('a cache inherits the enclosing target resolution by default', () => {
    expect(resolveBarrierResolution(2, { cacheAsTexture: true, cacheResolution: 'inherit', filters: noFilters })).toBe(2);
  });

  test('a barrier with neither a cache nor a filter still inherits — a mask target is a target too', () => {
    expect(resolveBarrierResolution(2.5, { cacheAsTexture: false, cacheResolution: 'inherit', filters: noFilters })).toBe(2.5);
  });

  test('an explicit filter resolution overrides inheritance in both directions', () => {
    expect(resolveBarrierResolution(2, { cacheAsTexture: false, cacheResolution: 'inherit', filters: [withResolution(new ColorMatrixFilter(), 1)] })).toBe(1);
    expect(resolveBarrierResolution(1, { cacheAsTexture: false, cacheResolution: 'inherit', filters: [withResolution(new ColorMatrixFilter(), 4)] })).toBe(4);
  });

  test('an explicit cache resolution overrides inheritance', () => {
    expect(resolveBarrierResolution(3, { cacheAsTexture: true, cacheResolution: 1, filters: noFilters })).toBe(1);
  });

  test('a chain runs at the LOWEST resolution any of its filters asks for', () => {
    const filters = [withResolution(new ColorMatrixFilter(), 2), withResolution(new BlurFilter(), 0.5), new ColorMatrixFilter()];

    // Not 2, not 3 (the inherited value of the third filter) — one cheap filter
    // pulls the whole chain down, because the chain shares one target size.
    expect(resolveBarrierResolution(3, { cacheAsTexture: false, cacheResolution: 'inherit', filters })).toBe(0.5);
  });

  test('a cache and its filters are minimised together', () => {
    expect(resolveBarrierResolution(3, { cacheAsTexture: true, cacheResolution: 2, filters: [withResolution(new ColorMatrixFilter(), 1)] })).toBe(1);
    expect(resolveBarrierResolution(3, { cacheAsTexture: true, cacheResolution: 1, filters: [withResolution(new ColorMatrixFilter(), 2)] })).toBe(1);
  });

  test('a nonsensical override falls back to inheritance rather than producing an unusable target', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveBarrierResolution(2, { cacheAsTexture: false, cacheResolution: 'inherit', filters: [withResolution(new ColorMatrixFilter(), bad)] })).toBe(
        2,
      );
      expect(resolveBarrierResolution(2, { cacheAsTexture: true, cacheResolution: bad, filters: noFilters })).toBe(2);
    }
  });

  test('a positive but tiny override is floored instead of collapsing to nothing', () => {
    expect(resolveBarrierResolution(2, { cacheAsTexture: true, cacheResolution: 1e-9, filters: noFilters })).toBeGreaterThan(0);
  });
});

describe('clampResolutionToTextureSize', () => {
  test('leaves a target that fits alone', () => {
    expect(clampResolutionToTextureSize(3, 200, 100, 4096)).toBe(3);
  });

  test('clamps so the LONGEST axis lands exactly on the device limit', () => {
    // 2000 logical units at resolution 3 would be 6000 texels on a 4096 device.
    expect(clampResolutionToTextureSize(3, 2000, 100, 4096)).toBeCloseTo(4096 / 2000, 10);
    expect(targetTexels(2000, clampResolutionToTextureSize(3, 2000, 100, 4096))).toBe(4096);
  });

  test('degrades toward the pre-inheritance behaviour rather than failing', () => {
    // Even a barrier far past the limit still yields a usable resolution; the
    // floor of the clamp is a smaller picture, never a lost frame.
    expect(clampResolutionToTextureSize(3, 100_000, 100_000, 4096)).toBeGreaterThan(0);
  });

  test('is inert when the device reports no limit', () => {
    expect(clampResolutionToTextureSize(3, 2000, 2000, 0)).toBe(3);
  });

  test('is inert for a degenerate barrier', () => {
    expect(clampResolutionToTextureSize(3, 0, 0, 4096)).toBe(3);
  });
});

describe('targetTexels', () => {
  test('a resolution-1 target is exactly its logical size, so the composite is a 1:1 blit', () => {
    expect(targetTexels(200, 1)).toBe(200);
    expect(targetTexels(201, 1)).toBe(201);
  });

  test('scales and rounds', () => {
    expect(targetTexels(200, 2)).toBe(400);
    expect(targetTexels(201, 1.5)).toBe(302);
    expect(targetTexels(200, 3)).toBe(600);
  });

  test('never asks for a zero-size texture', () => {
    expect(targetTexels(0, 2)).toBe(1);
    expect(targetTexels(1, 0.1)).toBe(1);
  });
});
