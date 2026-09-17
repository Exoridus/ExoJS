import { Matrix, type ReadonlyRectangle, Rectangle, Texture } from '@codexo/exojs';
import { describe, expect, test, vi } from 'vitest';

import { OccluderField } from '../src/occluders/OccluderField';
import { Occluders } from '../src/occluders/Occluders';
import type { OccluderSource } from '../src/occluders/OccluderSource';

/**
 * Tracing needs a 2D canvas and this lane has none, so the pixel read is
 * replaced by a synthetic field: an opaque block whose width follows the frame
 * being read. That makes two things observable that the real read hides - how
 * often a trace happens, and that stepping frames changes the outline.
 */
const probe = vi.hoisted(() => ({ regions: [] as string[] }));

vi.mock('../src/readAlphaField', () => ({
  readAlphaField: (_texture: unknown, width: number, height: number, region?: ReadonlyRectangle): Float32Array => {
    probe.regions.push(`${region?.left ?? 0},${region?.top ?? 0} ${width}x${height}`);

    const alpha = new Float32Array(width * height);
    // A block as wide as the frame's own column index, so frame 0 traces to
    // nothing, frame 1 to a thin block, frame 2 to a wider one.
    const solid = Math.round((region?.left ?? 0) / width);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x <= solid; x++) {
        alpha[y * width + x] = 1;
      }
    }

    return alpha;
  },
}));

const everywhere = new Rectangle(-1000, -1000, 2000, 2000);

/** A sprite-shaped drawable whose frame can be stepped the way a clip steps it. */
const animated = (texture: Texture) => {
  const frame = new Rectangle(0, 0, 8, 8);

  return {
    texture,
    textureFrame: frame,
    getLocalBounds: (): Rectangle => new Rectangle(0, 0, frame.width, frame.height),
    getWorldTransform: (): Matrix => new Matrix(),
    step: (column: number): void => {
      frame.set(column * 8, 0, 8, 8);
    },
  };
};

/** Segments the source collects right now. */
const segmentCount = (source: OccluderSource): number => {
  const field = new OccluderField();

  field.collect([source], everywhere);

  return field.count;
};

describe('an animated alpha occluder', () => {
  test('traces once per distinct frame and never again for one it has seen', () => {
    probe.regions.length = 0;

    const drawable = animated(new Texture(null));
    const source = Occluders.fromAlpha(drawable, { simplify: 0 });

    // Construction traces frame 0.
    expect(probe.regions).toEqual(['0,0 8x8']);

    // Collecting without stepping costs a comparison, not a trace.
    segmentCount(source);
    segmentCount(source);
    expect(probe.regions).toHaveLength(1);

    drawable.step(2);
    const wide = segmentCount(source);

    expect(probe.regions).toEqual(['0,0 8x8', '16,0 8x8']);

    drawable.step(1);
    const narrow = segmentCount(source);

    expect(probe.regions).toHaveLength(3);
    // Different frames, different silhouettes.
    expect(wide).toBeGreaterThan(0);
    expect(narrow).toBeGreaterThan(0);

    // Back to a frame already seen: the outline returns, the trace does not.
    drawable.step(2);
    expect(segmentCount(source)).toBe(wide);
    expect(probe.regions).toHaveLength(3);
  });

  test('a frame that traces to nothing is remembered as nothing', () => {
    probe.regions.length = 0;

    const drawable = animated(new Texture(null));
    const source = Occluders.fromAlpha(drawable, { simplify: 0 });

    expect(segmentCount(source)).toBe(0);

    drawable.step(3);
    expect(segmentCount(source)).toBeGreaterThan(0);

    drawable.step(0);
    expect(segmentCount(source)).toBe(0);
    // Frames 0 and 3 only.
    expect(probe.regions).toHaveLength(2);
  });

  test('a swapped texture is traced again, because the frame says nothing about its pixels', () => {
    probe.regions.length = 0;

    const drawable = animated(new Texture(null));
    const source = Occluders.fromAlpha(drawable, { simplify: 0 });

    segmentCount(source);
    expect(probe.regions).toHaveLength(1);

    (drawable as { texture: Texture }).texture = new Texture(null);
    segmentCount(source);

    expect(probe.regions).toHaveLength(2);
  });
});
