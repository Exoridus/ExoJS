import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import {
  buildPixelSnapContext,
  getPixelSnapDowngradeReason,
  type PixelSnapContext,
  PixelSnapMode,
  type RenderQuad,
  resolveEffectivePixelSnapMode,
  resolveUploadTransform,
  snapBoundsInto,
  snapLocalBoundary,
  snapQuadsInto,
  snapWorldTranslationInto,
} from '#rendering/pixelSnap';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import type { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTexture = (w = 64, h = 64): Texture => ({ width: w, height: h, flipY: false, updateSource: () => undefined }) as unknown as Texture;

/** An axis-aligned, non-following view covering a `w × h` world region 1:1. */
const makeView = (w = 100, h = 100): View => new View(w / 2, h / 2, w, h);

const quad = (x0: number, y0: number, x1: number, y1: number): RenderQuad => ({ x0, y0, x1, y1, u0: 0, v0: 0, u1: 1, v1: 1 });

/** A minimal axis-aligned context for the pure boundary-snapping helpers. */
const ctxOf = (scaleX: number, scaleY: number): PixelSnapContext => ({
  originX: 0,
  originY: 0,
  snappedOriginX: 0,
  snappedOriginY: 0,
  worldX: 0,
  worldY: 0,
  scaleX,
  scaleY,
  axisAligned: true,
});

// ---------------------------------------------------------------------------
// Public API — Drawable.pixelSnapMode
// ---------------------------------------------------------------------------

describe('Drawable.pixelSnapMode — public API', () => {
  test('defaults to none', () => {
    expect(new Sprite(null).pixelSnapMode).toBe(PixelSnapMode.None);
  });

  test('accepts every valid mode', () => {
    const sprite = new Sprite(null);

    for (const mode of [PixelSnapMode.Position, PixelSnapMode.Geometry, PixelSnapMode.None] as const) {
      sprite.pixelSnapMode = mode;
      expect(sprite.pixelSnapMode).toBe(mode);
    }
  });

  test('throws on an invalid value and leaves the prior mode unchanged', () => {
    const sprite = new Sprite(null);

    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    expect(() => {
      sprite.pixelSnapMode = 'invalid' as unknown as PixelSnapMode;
    }).toThrow();
    expect(sprite.pixelSnapMode).toBe(PixelSnapMode.Geometry);
  });

  test('setting the same value is a no-op (does not invalidate the cache)', () => {
    const sprite = new Sprite(null);

    sprite.pixelSnapMode = PixelSnapMode.Position;
    sprite.invalidateCache();
    // Re-clear via a fresh read; then a same-value set must not re-dirty.
    (sprite as unknown as { _cacheDirty: boolean })._cacheDirty = false;
    sprite.pixelSnapMode = PixelSnapMode.Position;
    expect((sprite as unknown as { _cacheDirty: boolean })._cacheDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// snapLocalBoundary — the shared per-axis rounding primitive
// ---------------------------------------------------------------------------

describe('snapLocalBoundary', () => {
  test('rounds to the nearest device pixel: round(L*scale)/scale', () => {
    expect(snapLocalBoundary(10.3, 2)).toBeCloseTo(10.5, 10); // round(20.6)=21 → 10.5
    expect(snapLocalBoundary(10, 1)).toBe(10);
    expect(snapLocalBoundary(0, 4)).toBe(0);
  });

  test('the snapped value lands on a whole device pixel', () => {
    for (const [l, s] of [
      [10.3, 2],
      [7.7, 3],
      [123.456, 1],
      [5.2, 0.5],
    ] as const) {
      expect(snapLocalBoundary(l, s) * s).toBeCloseTo(Math.round(l * s), 6);
    }
  });

  test('ties round toward +infinity (Math.round)', () => {
    expect(snapLocalBoundary(0.5, 1)).toBe(1);
    expect(snapLocalBoundary(1.5, 1)).toBe(2);
    expect(snapLocalBoundary(-0.5, 1)).toBeCloseTo(0, 10); // round(-0.5) → -0 (toward +∞, not -1)
  });

  test('is monotonic non-decreasing for positive scale', () => {
    let prev = -Infinity;

    for (let l = -5; l <= 5; l += 0.13) {
      const snapped = snapLocalBoundary(l, 2);

      expect(snapped).toBeGreaterThanOrEqual(prev);
      prev = snapped;
    }
  });

  test('preserves order under negative scale (flip) — no inverted spans', () => {
    let prev = -Infinity;

    for (let l = -5; l <= 5; l += 0.13) {
      const snapped = snapLocalBoundary(l, -2);

      expect(snapped).toBeGreaterThanOrEqual(prev);
      prev = snapped;
    }
  });

  test('returns the input unchanged for a degenerate (~0) scale', () => {
    expect(snapLocalBoundary(3.7, 0)).toBe(3.7);
    expect(snapLocalBoundary(3.7, 1e-9)).toBe(3.7);
  });

  test('returns non-finite input unchanged', () => {
    expect(snapLocalBoundary(NaN, 2)).toBeNaN();
    expect(snapLocalBoundary(Infinity, 2)).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// snapQuadsInto — shared boundary plan (NineSlice / RepeatingSprite)
// ---------------------------------------------------------------------------

describe('snapQuadsInto — shared boundaries', () => {
  const ctx = ctxOf(1.5, 1.5);

  test('quads that share a boundary value snap to the SAME value (seam-free)', () => {
    // Two adjacent quads: left [0,32], right [32,64]. The shared edge (32) must
    // map to one value in both, or a gap/overlap opens.
    const source = [quad(0, 0, 32.4, 16.4), quad(32.4, 0, 64.7, 16.4)];
    const out: RenderQuad[] = [];

    snapQuadsInto(source, ctx, out);

    expect(out[0]!.x1).toBe(out[1]!.x0);
  });

  test('chunk-edge equality: a boundary shared across separate quad lists snaps identically', () => {
    // Simulate two chunks: chunk A's right edge and chunk B's left edge are the
    // same coordinate value but live in different snapQuadsInto calls.
    const a: RenderQuad[] = [];
    const b: RenderQuad[] = [];

    snapQuadsInto([quad(0, 0, 96.3, 32)], ctx, a);
    snapQuadsInto([quad(96.3, 0, 192.6, 32)], ctx, b);

    expect(a[0]!.x1).toBe(b[0]!.x0);
  });

  test('preserves monotonic order (no negative spans) and UVs', () => {
    const source = [quad(0, 0, 0.1, 0.1), quad(5.4, 7.2, 18.9, 20.1)];
    const out: RenderQuad[] = [];

    snapQuadsInto(source, ctx, out);

    for (const q of out) {
      expect(q.x1).toBeGreaterThanOrEqual(q.x0);
      expect(q.y1).toBeGreaterThanOrEqual(q.y0);
      expect(q.u0).toBe(0);
      expect(q.v1).toBe(1);
    }
  });

  test('reuses the output buffer across calls without reallocating object slots', () => {
    const out: RenderQuad[] = [];

    snapQuadsInto([quad(0, 0, 4, 4), quad(4, 0, 8, 4)], ctx, out);
    const firstSlot = out[0];

    expect(out.length).toBe(2);

    snapQuadsInto([quad(0, 0, 4, 4)], ctx, out);
    expect(out.length).toBe(1);
    expect(out[0]).toBe(firstSlot); // same object instance reused
  });
});

describe('snapBoundsInto', () => {
  test('snaps all four edges and never produces a negative span', () => {
    const ctx = ctxOf(1.3, 1.3);
    const out = new Rectangle();

    snapBoundsInto(new Rectangle(0.4, 0.6, 10.3, 12.7), ctx, out);

    expect(out.width).toBeGreaterThanOrEqual(0);
    expect(out.height).toBeGreaterThanOrEqual(0);
    expect(out.left * ctx.scaleX).toBeCloseTo(Math.round(0.4 * ctx.scaleX), 6);
  });
});

// ---------------------------------------------------------------------------
// buildPixelSnapContext — device-pixel coordinate mapping
// ---------------------------------------------------------------------------

describe('buildPixelSnapContext — coordinate conversion', () => {
  test('snapped origin is a whole device pixel and round-trips back to world', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, 12.37, 0, 1, 7.91);
    const ctx = buildPixelSnapContext(world, view, 100, 100);

    expect(Number.isInteger(ctx.snappedOriginX)).toBe(true);
    expect(Number.isInteger(ctx.snappedOriginY)).toBe(true);
    expect(ctx.snappedOriginX).toBe(Math.round(ctx.originX));

    const device = view.worldToScreen(ctx.worldX, ctx.worldY, 100, 100);

    expect(device.x).toBeCloseTo(ctx.snappedOriginX, 3);
    expect(device.y).toBeCloseTo(ctx.snappedOriginY, 3);
  });

  test('device-pixel ratio: doubling the target pixels doubles the device scale', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, 0, 0, 1, 0);
    const dpr1 = buildPixelSnapContext(world, view, 100, 100);
    const dpr2 = buildPixelSnapContext(world, view, 200, 200);

    expect(Math.abs(dpr1.scaleX)).toBeCloseTo(1, 3);
    expect(Math.abs(dpr2.scaleX)).toBeCloseTo(2, 3);
  });

  test('snaps in DEVICE space (DPR-aware), not by blindly rounding CSS/world coords', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, 10.5, 0, 1, 10.5);
    const ctx = buildPixelSnapContext(world, view, 200, 200);

    // Device scale is 2 at DPR 2 (200 device px over 100 world units).
    expect(Math.abs(ctx.scaleX)).toBeCloseTo(2, 2);
    // The snapped origin is an exact device pixel (round of the device-space origin).
    expect(ctx.snappedOriginX).toBe(Math.round(ctx.originX));
    // Snapping moves the origin by at most half a DEVICE pixel — never a full CSS px.
    expect(Math.abs(ctx.worldX - 10.5) * Math.abs(ctx.scaleX)).toBeLessThanOrEqual(0.5 + 1e-6);
  });

  test('camera zoom scales the device mapping', () => {
    const view = makeView(100, 100);
    const world = new Matrix();

    view.setZoom(2); // halves the visible area → doubles world→device scale
    const ctx = buildPixelSnapContext(world, view, 100, 100);

    expect(Math.abs(ctx.scaleX)).toBeCloseTo(2, 2);
  });

  test('camera offset shifts the origin but not the scale', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, 30, 0, 1, 30);
    const a = buildPixelSnapContext(world, view, 100, 100);

    view.setCenter(40, 40);
    const b = buildPixelSnapContext(world, view, 100, 100);

    expect(Math.abs(a.scaleX)).toBeCloseTo(Math.abs(b.scaleX), 4);
    expect(a.originX).not.toBeCloseTo(b.originX, 1);
  });

  test('negative world coordinates still snap to a whole device pixel', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, -12.6, 0, 1, -3.2);
    const ctx = buildPixelSnapContext(world, view, 100, 100);

    expect(Number.isInteger(ctx.snappedOriginX)).toBe(true);
    expect(Number.isInteger(ctx.snappedOriginY)).toBe(true);
  });

  test('degenerate target size yields a safe no-op context', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(1, 0, 5.4, 0, 1, 6.7);
    const ctx = buildPixelSnapContext(world, view, 0, 0);

    expect(ctx.axisAligned).toBe(false);
    expect(ctx.worldX).toBe(5.4);
    expect(ctx.worldY).toBe(6.7);
  });

  test('axis-aligned for pure / non-uniform / negative scale; not for rotation or skew', () => {
    const view = makeView(100, 100);

    const pure = new Matrix().set(2, 0, 10, 0, 2, 10);
    const nonUniform = new Matrix().set(3, 0, 10, 0, 1, 10);
    const flip = new Matrix().set(-2, 0, 10, 0, 2, 10);
    const rotated = new Matrix().set(0.7071, 0.7071, 10, -0.7071, 0.7071, 10);
    const skewed = new Matrix().set(1, 0.4, 10, 0, 1, 10);

    expect(buildPixelSnapContext(pure, view, 100, 100).axisAligned).toBe(true);
    expect(buildPixelSnapContext(nonUniform, view, 100, 100).axisAligned).toBe(true);
    expect(buildPixelSnapContext(flip, view, 100, 100).axisAligned).toBe(true);
    expect(buildPixelSnapContext(rotated, view, 100, 100).axisAligned).toBe(false);
    expect(buildPixelSnapContext(skewed, view, 100, 100).axisAligned).toBe(false);
  });

  test('a rotated view downgrades axis alignment even for an axis-aligned node', () => {
    const view = makeView(100, 100);

    view.setRotation(30);
    expect(buildPixelSnapContext(new Matrix(), view, 100, 100).axisAligned).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// snapWorldTranslationInto — position snapping is translation-only
// ---------------------------------------------------------------------------

describe('snapWorldTranslationInto', () => {
  test('replaces only the translation, preserving the linear part, without mutating the source', () => {
    const view = makeView(100, 100);
    const world = new Matrix().set(2, 0.5, 12.4, -0.5, 2, 7.8);
    const snapshot = world.clone();
    const ctx = buildPixelSnapContext(world, view, 100, 100);
    const out = new Matrix();

    snapWorldTranslationInto(out, world, ctx);

    // linear part copied verbatim
    expect(out.a).toBe(world.a);
    expect(out.b).toBe(world.b);
    expect(out.c).toBe(world.c);
    expect(out.d).toBe(world.d);
    // translation replaced by the snapped world origin
    expect(out.x).toBe(ctx.worldX);
    expect(out.y).toBe(ctx.worldY);
    // source untouched
    expect(world.equals(snapshot)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEffectivePixelSnapMode / downgrade
// ---------------------------------------------------------------------------

describe('resolveEffectivePixelSnapMode', () => {
  test('passes none / position through regardless of alignment', () => {
    for (const aligned of [true, false]) {
      expect(resolveEffectivePixelSnapMode(PixelSnapMode.None, aligned)).toBe(PixelSnapMode.None);
      expect(resolveEffectivePixelSnapMode(PixelSnapMode.Position, aligned)).toBe(PixelSnapMode.Position);
    }
  });

  test('keeps geometry when axis-aligned, downgrades to position otherwise', () => {
    expect(resolveEffectivePixelSnapMode(PixelSnapMode.Geometry, true)).toBe(PixelSnapMode.Geometry);
    expect(resolveEffectivePixelSnapMode(PixelSnapMode.Geometry, false)).toBe(PixelSnapMode.Position);
  });

  test('is stateless — alignment restoring brings geometry back', () => {
    expect(resolveEffectivePixelSnapMode(PixelSnapMode.Geometry, false)).toBe(PixelSnapMode.Position);
    expect(resolveEffectivePixelSnapMode(PixelSnapMode.Geometry, true)).toBe(PixelSnapMode.Geometry);
  });

  test('downgrade reason is set only for a downgraded geometry request', () => {
    expect(getPixelSnapDowngradeReason(PixelSnapMode.Geometry, false)).toBe('non-axis-aligned');
    expect(getPixelSnapDowngradeReason(PixelSnapMode.Geometry, true)).toBeNull();
    expect(getPixelSnapDowngradeReason(PixelSnapMode.Position, false)).toBeNull();
    expect(getPixelSnapDowngradeReason(PixelSnapMode.None, false)).toBeNull();
  });
});

describe('effective alignment from a composed world transform', () => {
  test('a rotated parent downgrades an otherwise axis-aligned child', () => {
    const view = makeView(200, 200);
    const parent = new Container();
    const child = new Sprite(null);

    parent.setRotation(20);
    parent.addChild(child);

    expect(buildPixelSnapContext(child.getGlobalTransform(), view, 200, 200).axisAligned).toBe(false);

    parent.setRotation(0);
    expect(buildPixelSnapContext(child.getGlobalTransform(), view, 200, 200).axisAligned).toBe(true);

    parent.destroy();
  });
});

// ---------------------------------------------------------------------------
// resolveUploadTransform — group-aware DEVICE snapping (expert-review R2)
// ---------------------------------------------------------------------------
//
// Inside a RetainedContainer the GPU applies the group matrix AFTER the buffer
// row (`u_projection · u_group · (row · local)`), so snapping the group-LOCAL
// origin (the old behaviour) snapped to the wrong grid and the final device
// position drifted off-pixel. resolveUploadTransform now snaps the composed
// `group · local` device origin and peels the group matrix back off the row it
// uploads, so the shader's re-applied group matrix lands the origin on a whole
// device pixel.

describe('resolveUploadTransform — group-aware device snapping (R2)', () => {
  test('without a group, snaps the global origin directly (unchanged behaviour)', () => {
    const view = makeView(100, 100);
    const sprite = new Sprite(makeTexture());

    sprite.setPosition(12.37, 7.91);
    sprite.pixelSnapMode = PixelSnapMode.Position;

    const scratch = new Matrix();
    const uploaded = resolveUploadTransform(sprite, view, 100, 100, scratch, null);
    const device = view.worldToScreen(uploaded.x, uploaded.y, 100, 100);

    expect(device.x).toBeCloseTo(Math.round(device.x), 6);
    expect(device.y).toBeCloseTo(Math.round(device.y), 6);

    sprite.destroy();
  });

  test('PixelSnapMode.None returns the live group-local transform, group or not', () => {
    const view = makeView(100, 100);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    group.setPosition(30.4, 10.6);
    group.addChild(sprite);
    sprite.setPosition(5.2, 7.8);
    sprite.pixelSnapMode = PixelSnapMode.None;

    const uploaded = resolveUploadTransform(sprite, view, 100, 100, new Matrix(), group.getGlobalTransform());

    expect(uploaded).toBe(sprite.getGlobalTransform());

    group.destroy();
  });

  test('snaps the FINAL device origin (group × local), not the group-local origin', () => {
    const view = makeView(100, 100);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    // Both offsets fractional → the composed origin is fractional in device space.
    group.setPosition(30.4, 10.6);
    group.addChild(sprite);
    sprite.setPosition(5.2, 7.8);
    sprite.pixelSnapMode = PixelSnapMode.Position;

    const groupWorld = group.getGlobalTransform(); // group is the boundary → its own world matrix
    const uploaded = resolveUploadTransform(sprite, view, 100, 100, new Matrix(), groupWorld);

    // The shader computes `group · uploaded`; that composed origin must be a
    // whole device pixel — the whole point of the fix.
    const composed = uploaded.clone().combine(groupWorld);
    const device = view.worldToScreen(composed.x, composed.y, 100, 100);

    expect(device.x).toBeCloseTo(Math.round(device.x), 5);
    expect(device.y).toBeCloseTo(Math.round(device.y), 5);

    // The uploaded row's LINEAR part is still the sprite's group-local linear
    // part (position snapping never touches scale/rotation).
    const local = sprite.getGlobalTransform();

    expect(uploaded.a).toBeCloseTo(local.a, 6);
    expect(uploaded.d).toBeCloseTo(local.d, 6);

    group.destroy();
  });

  test('snapping the group-local origin (the old behaviour) would MISS the device grid', () => {
    const view = makeView(100, 100);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    group.setPosition(0.5, 0.5); // half-pixel group offset
    group.addChild(sprite);
    sprite.setPosition(4, 4); // already integer in group-local space
    sprite.pixelSnapMode = PixelSnapMode.Position;

    const groupWorld = group.getGlobalTransform();

    // Group-local snap (ignores the group) leaves the row at (4, 4); composed
    // with the 0.5 group offset the device origin is 4.5 — off the grid.
    const groupLocalOnly = view.worldToScreen(4 + 0.5, 4 + 0.5, 100, 100);

    expect(groupLocalOnly.x).not.toBeCloseTo(Math.round(groupLocalOnly.x), 3);

    // The fix pulls it back onto a whole device pixel.
    const uploaded = resolveUploadTransform(sprite, view, 100, 100, new Matrix(), groupWorld);
    const composed = uploaded.clone().combine(groupWorld);
    const device = view.worldToScreen(composed.x, composed.y, 100, 100);

    expect(device.x).toBeCloseTo(Math.round(device.x), 5);

    group.destroy();
  });

  test('never mutates the group matrix it is handed', () => {
    const view = makeView(100, 100);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    group.setPosition(12.3, 4.7);
    group.addChild(sprite);
    sprite.setPosition(3.1, 9.4);
    sprite.pixelSnapMode = PixelSnapMode.Position;

    const groupWorld = group.getGlobalTransform();
    const snapshot = groupWorld.clone();

    resolveUploadTransform(sprite, view, 100, 100, new Matrix(), groupWorld);

    expect(groupWorld.equals(snapshot)).toBe(true);

    snapshot.destroy();
    group.destroy();
  });
});

describe('geometry snapping is group-aware (R2)', () => {
  test('boundary scale uses the FULL device scale through a scaled group', () => {
    const view = makeView(100, 100);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    group.addChild(sprite);
    group.setScale(2); // group doubles the device scale

    const ctxWorld = buildPixelSnapContext(sprite.getWorldTransform(), view, 100, 100);

    expect(Math.abs(ctxWorld.scaleX)).toBeCloseTo(2, 3);

    // The old group-local matrix saw the sprite's own scale only (1) — the bug.
    const ctxLocal = buildPixelSnapContext(sprite.getGlobalTransform(), view, 100, 100);

    expect(Math.abs(ctxLocal.scaleX)).toBeCloseTo(1, 3);

    group.destroy();
  });

  test('a rotated GROUP downgrades geometry snapping for an axis-aligned child', () => {
    const view = makeView(200, 200);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture());

    group.addChild(sprite);
    group.setRotation(20);

    // Fixed: the group rotation is now visible → downgrade.
    expect(buildPixelSnapContext(sprite.getWorldTransform(), view, 200, 200).axisAligned).toBe(false);
    // Old group-local matrix looked axis-aligned → silently wrong snap.
    expect(buildPixelSnapContext(sprite.getGlobalTransform(), view, 200, 200).axisAligned).toBe(true);

    group.destroy();
  });

  test('Sprite.getRenderBounds downgrades to logical bounds inside a rotated group', () => {
    const view = makeView(200, 200);
    const group = new RetainedContainer();
    const sprite = new Sprite(makeTexture(16, 16));

    sprite.pixelSnapMode = PixelSnapMode.Geometry;
    group.addChild(sprite);
    group.setRotation(20);

    const out = new Rectangle();

    // The rotation lives in the group; geometry must downgrade and return the
    // logical local bounds unchanged (same reference). Under the old
    // group-local behaviour it would have returned snapped `out` instead.
    expect(sprite.getRenderBounds(view, 200, 200, out)).toBe(sprite.getLocalBounds());

    group.destroy();
  });
});

// ---------------------------------------------------------------------------
// Logical / render separation — snapping never mutates logical state
// ---------------------------------------------------------------------------

describe('logical / render separation', () => {
  test('Sprite: setting pixelSnapMode leaves logical transform, position and bounds untouched', () => {
    const sprite = new Sprite(makeTexture(16, 16));

    sprite.setPosition(10.37, 20.91);
    const worldBefore = sprite.getGlobalTransform().clone();
    const boundsBefore = sprite.getBounds().clone();
    const verticesBefore = Float32Array.from(sprite.vertices);

    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    expect(sprite.x).toBe(10.37);
    expect(sprite.y).toBe(20.91);
    expect(sprite.getGlobalTransform().equals(worldBefore)).toBe(true);
    expect(sprite.getBounds().equals(boundsBefore)).toBe(true);
    expect(Array.from(sprite.vertices)).toEqual(Array.from(verticesBefore));

    worldBefore.destroy();
    boundsBefore.destroy();
    sprite.destroy();
  });

  test('NineSlice: render-time snapping does not rebuild or mutate the content quad cache', () => {
    const sprite = new NineSliceSprite(makeTexture(48, 48), { slices: 8, width: 100, height: 100 });

    sprite.setPosition(5.3, 9.7);
    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    const contentQuads = sprite.quads; // builds + caches the content plan
    const dirtyAfterBuild = (sprite as unknown as { _geometryDirty: boolean })._geometryDirty;

    const view = makeView(200, 200);
    const rendered = sprite.getRenderQuads(view, 200, 200);

    // content cache reused (same reference), never re-dirtied by snapping
    expect(sprite.quads).toBe(contentQuads);
    expect((sprite as unknown as { _geometryDirty: boolean })._geometryDirty).toBe(dirtyAfterBuild);
    // snapped quads are a separate buffer with the same count
    expect(rendered).not.toBe(contentQuads);
    expect(rendered.length).toBe(contentQuads.length);

    sprite.destroy();
  });

  test('NineSlice: geometry snapping downgrades (returns the content plan) under rotation', () => {
    const sprite = new NineSliceSprite(makeTexture(48, 48), { slices: 8, width: 100, height: 100 });

    sprite.setRotation(15);
    sprite.pixelSnapMode = PixelSnapMode.Geometry;

    const view = makeView(200, 200);

    expect(sprite.getRenderQuads(view, 200, 200)).toBe(sprite.quads);

    sprite.destroy();
  });

  test('Sprite.getRenderBounds returns logical bounds for non-geometry modes', () => {
    const sprite = new Sprite(makeTexture(16, 16));
    const view = makeView(100, 100);
    const out = new Rectangle();

    sprite.pixelSnapMode = PixelSnapMode.Position;
    expect(sprite.getRenderBounds(view, 100, 100, out)).toBe(sprite.getLocalBounds());

    sprite.destroy();
  });
});
