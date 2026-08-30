/**
 * The effect output-bounds contract.
 *
 * A drawable's source bounds are not assumed to equal its final visual bounds.
 * Each effect declares what logical bounds it can produce from the bounds it
 * will be given, the chain composes those answers in order, and the capture
 * domain is quantised from the resulting rectangle edge by edge.
 *
 * These cells pin the contract itself - the `Bounds -> Bounds` shape, its
 * sequential composition and the quantisation - without a GPU. The pixel proof
 * that a blur is no longer clipped lives in the browser suites.
 */

import { type ReadonlyRectangle, Rectangle } from '#math/Rectangle';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { Filter } from '#rendering/filters/Filter';
import { EffectBoundsResolver } from '#rendering/plan/EffectBoundsResolver';

/** Bounds-preserving: the default contract, spelled out by not overriding it. */
class IdentityFilter extends Filter {
  public apply(): void {
    // no GPU work - these cells never render
  }
}

/**
 * Bounds-transforming in a way no scalar padding can express. Its whole purpose
 * is to prove the contract really is `Bounds -> Bounds`: a hidden
 * `padding: number` could not move one edge without moving the opposite one.
 */
class AsymmetricFilter extends Filter {
  public constructor(
    private readonly _left: number,
    private readonly _top: number,
    private readonly _right: number,
    private readonly _bottom: number,
  ) {
    super();
  }

  public apply(): void {
    // no GPU work - these cells never render
  }

  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x - this._left, input.y - this._top, input.width + this._left + this._right, input.height + this._top + this._bottom);
  }
}

/** Bounds-reducing, e.g. a crop. */
class ShrinkFilter extends Filter {
  public constructor(private readonly _inset: number) {
    super();
  }

  public apply(): void {
    // no GPU work - these cells never render
  }

  public override getOutputBounds(input: ReadonlyRectangle, output: Rectangle): void {
    output.set(input.x + this._inset, input.y + this._inset, input.width - this._inset * 2, input.height - this._inset * 2);
  }
}

const resolve = (source: Rectangle, filters: readonly Filter[]): { left: number; top: number; width: number; height: number } | null => {
  const resolver = new EffectBoundsResolver();

  if (!resolver.resolve(source, filters)) return null;

  return { left: resolver.left, top: resolver.top, width: resolver.width, height: resolver.height };
};

describe('a single effect transforms bounds', () => {
  test('the default contract preserves its input', () => {
    expect(resolve(new Rectangle(10, 20, 30, 40), [new IdentityFilter()])).toEqual({ left: 10, top: 20, width: 30, height: 40 });
  });

  test('no filters at all leaves the source bounds', () => {
    expect(resolve(new Rectangle(10, 20, 30, 40), [])).toEqual({ left: 10, top: 20, width: 30, height: 40 });
  });

  test('a symmetric expansion moves all four edges', () => {
    expect(resolve(new Rectangle(100, 50, 20, 10), [new AsymmetricFilter(8, 8, 8, 8)])).toEqual({ left: 92, top: 42, width: 36, height: 26 });
  });

  test('an asymmetric expansion moves the edges independently', () => {
    // A drop shadow's shape: nothing added to the left or top, room on the
    // right and bottom. No scalar padding can produce this.
    expect(resolve(new Rectangle(0, 0, 10, 10), [new AsymmetricFilter(0, 0, 6, 3)])).toEqual({ left: 0, top: 0, width: 16, height: 13 });
  });

  test('a bounds-reducing effect keeps the domain its input needed', () => {
    // The executor runs the whole chain against one target, and the invariant
    // that matters is that no pass is clipped: the crop's own output is smaller,
    // but the domain still has to hold what was captured for it.
    expect(resolve(new Rectangle(0, 0, 20, 20), [new ShrinkFilter(5)])).toEqual({ left: 0, top: 0, width: 20, height: 20 });
  });

  test('a zero-sized source is refused rather than captured', () => {
    expect(resolve(new Rectangle(5, 5, 0, 0), [new IdentityFilter()])).toBeNull();
  });

  test('a filter that answers with non-finite bounds costs only its own expansion', () => {
    // A broken bounds transform must not be able to take the whole node down
    // with it: its answer is not counted, and the rest of the chain still gets
    // the domain it asked for.
    expect(resolve(new Rectangle(0, 0, 10, 10), [new AsymmetricFilter(Number.NaN, 0, 0, 0), new AsymmetricFilter(0, 0, 4, 0)])).toEqual({
      left: 0,
      top: 0,
      width: 14,
      height: 10,
    });
  });

  test('a non-finite source is refused rather than captured', () => {
    expect(resolve(new Rectangle(Number.NaN, 0, 10, 10), [])).toBeNull();
  });
});

describe('a chain composes sequentially', () => {
  test('each filter is asked with its predecessor´s output', () => {
    // Two expansions of 4 and 6 give 10, not max(4, 6) and not a single pass'
    // worth of room.
    expect(resolve(new Rectangle(0, 0, 10, 10), [new AsymmetricFilter(4, 4, 4, 4), new AsymmetricFilter(6, 6, 6, 6)])).toEqual({
      left: -10,
      top: -10,
      width: 30,
      height: 30,
    });
  });

  test('composition is order-sensitive for asymmetric effects', () => {
    const right = new AsymmetricFilter(0, 0, 4, 0);
    const shrink = new ShrinkFilter(2);

    // Expand-then-shrink keeps the expanded room; shrink-then-expand starts from
    // a narrower rectangle and reaches a different right edge. Only a real
    // `Bounds -> Bounds` composition can tell the two apart.
    expect(resolve(new Rectangle(0, 0, 10, 10), [right, shrink])).toEqual({ left: 0, top: 0, width: 14, height: 10 });
    expect(resolve(new Rectangle(0, 0, 10, 10), [shrink, right])).toEqual({ left: 0, top: 0, width: 12, height: 10 });
  });

  test('an identity effect in the middle changes nothing', () => {
    expect(resolve(new Rectangle(0, 0, 10, 10), [new AsymmetricFilter(3, 3, 3, 3), new IdentityFilter(), new AsymmetricFilter(2, 2, 2, 2)])).toEqual(
      resolve(new Rectangle(0, 0, 10, 10), [new AsymmetricFilter(5, 5, 5, 5)]),
    );
  });
});

describe('capture quantisation covers every logical pixel', () => {
  test('a fractional origin does not lose the far edge', () => {
    // x spans [0.25, 10.75]. Rounding the size independently - floor(0.25) plus
    // ceil(10.5) - would give 10 and cut the last half pixel off.
    expect(resolve(new Rectangle(0.25, 0.25, 10.5, 10.5), [])).toEqual({ left: 0, top: 0, width: 11, height: 11 });
  });

  test('a negative fractional origin rounds outward on both edges', () => {
    // x spans [-0.25, 10.25]: left floors to -1, right ceils to 11, width 12.
    expect(resolve(new Rectangle(-0.25, -0.25, 10.5, 10.5), [])).toEqual({ left: -1, top: -1, width: 12, height: 12 });
  });

  test('already integral bounds are left alone', () => {
    expect(resolve(new Rectangle(-4, -8, 16, 32), [])).toEqual({ left: -4, top: -8, width: 16, height: 32 });
  });

  test('a fractional expansion is quantised after the chain, not before it', () => {
    // Source [10.5, 20.5], expansion 0.25 -> [10.25, 20.75] -> [10, 21].
    expect(resolve(new Rectangle(10.5, 0, 10, 10), [new AsymmetricFilter(0.25, 0, 0.25, 0)])).toEqual({ left: 10, top: 0, width: 11, height: 10 });
  });

  test('zero expansion leaves the source quantisation untouched', () => {
    expect(resolve(new Rectangle(0.5, 0.5, 9, 9), [new AsymmetricFilter(0, 0, 0, 0)])).toEqual(resolve(new Rectangle(0.5, 0.5, 9, 9), []));
  });
});

describe('BlurFilter declares its real sampling reach', () => {
  test('the expansion is the radius on every edge', () => {
    expect(resolve(new Rectangle(100, 50, 100, 50), [new BlurFilter({ radius: 8 })])).toEqual({ left: 92, top: 42, width: 116, height: 66 });
  });

  test('quality adds samples without changing the reach', () => {
    const low = resolve(new Rectangle(0, 0, 32, 32), [new BlurFilter({ radius: 6, quality: 1 })]);
    const high = resolve(new Rectangle(0, 0, 32, 32), [new BlurFilter({ radius: 6, quality: 8 })]);

    expect(low).toEqual(high);
  });

  test('a zero radius expands nothing', () => {
    expect(resolve(new Rectangle(0, 0, 32, 32), [new BlurFilter({ radius: 0 })])).toEqual({ left: 0, top: 0, width: 32, height: 32 });
  });

  test('two blurs in a chain sum their reaches', () => {
    expect(resolve(new Rectangle(0, 0, 10, 10), [new BlurFilter({ radius: 3 }), new BlurFilter({ radius: 5 })])).toEqual({
      left: -8,
      top: -8,
      width: 26,
      height: 26,
    });
  });

  test('the expansion follows a radius changed after construction', () => {
    const blur = new BlurFilter({ radius: 2 });
    const source = new Rectangle(0, 0, 10, 10);

    expect(resolve(source, [blur])).toEqual({ left: -2, top: -2, width: 14, height: 14 });

    blur.radius = 9;

    expect(resolve(source, [blur])).toEqual({ left: -9, top: -9, width: 28, height: 28 });
  });
});

describe('the resolver does not allocate per resolution', () => {
  test('repeated resolutions reuse the same scratch rectangles', () => {
    const resolver = new EffectBoundsResolver();
    const source = new Rectangle(0, 0, 10, 10);
    const filters = [new BlurFilter({ radius: 4 }), new BlurFilter({ radius: 4 }), new BlurFilter({ radius: 4 })];

    // An odd chain length leaves the scratch pair swapped relative to where it
    // started; running twice proves the swap is carried, not leaked.
    for (let run = 0; run < 4; run++) {
      expect(resolver.resolve(source, filters)).toBe(true);
      expect([resolver.left, resolver.top, resolver.width, resolver.height]).toEqual([-12, -12, 34, 34]);
    }
  });
});
