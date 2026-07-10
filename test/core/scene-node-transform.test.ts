import { SceneNode } from '#core/SceneNode';
import { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';

// Regression suite for the SceneNode transform cache after the 0.5.0 inline
// of `Transformable`. These tests assert behavior that was previously implicit
// in `Transformable + SceneNode` and is now consolidated on `SceneNode` alone.
//
// They protect:
//  - local matrix caching (lazy compute on first getTransform after dirty)
//  - dirty-flag propagation from setters / observable vectors
//  - parent-child transform composition
//  - bounds recomputation after transform changes
//  - destroy() cleanup of all owned resources
//  - no callback re-entry on no-op writes (idle nodes stay clean)

class TestDrawable extends Drawable {
  public override updateBounds(): this {
    // Treat the drawable as a 100x100 unit-square in local space so bounds
    // assertions have something nontrivial to verify.
    const local = this.getLocalBounds();

    local.set(0, 0, 100, 100);

    return super.updateBounds();
  }
}

describe('SceneNode transform cache (post-Transformable inline)', () => {
  test('first getTransform() materializes the local matrix once', () => {
    const node = new SceneNode();
    const updateSpy = vi.spyOn(node, 'updateTransform');

    // Touching getTransform() the first time triggers updateTransform()
    // because the dirty `Transform` bit is set in the field initializer.
    const matrix1 = node.getTransform();

    expect(matrix1).toBeInstanceOf(Matrix);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // Second call with no mutation must NOT recompute. The cache holds.
    const matrix2 = node.getTransform();

    expect(matrix2).toBe(matrix1);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    node.destroy();
  });

  test('setPosition with the same value does not invalidate the cache', () => {
    const node = new SceneNode();

    // Settle the cache.
    node.getTransform();

    const updateSpy = vi.spyOn(node, 'updateTransform');

    // No-op writes (same value) must not push a dirty bit.
    node.setPosition(0, 0);
    node.setRotation(0);
    node.setScale(1, 1);
    node.setOrigin(0, 0);

    node.getTransform();

    expect(updateSpy).not.toHaveBeenCalled();

    node.destroy();
  });

  test('changing position invalidates the local matrix and recomputes on next getTransform', () => {
    const node = new SceneNode();

    // Settle initial cache.
    node.getTransform();

    const updateSpy = vi.spyOn(node, 'updateTransform');

    node.setPosition(10, 20);

    // Setter does not eagerly recompute.
    expect(updateSpy).not.toHaveBeenCalled();

    const matrix = node.getTransform();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(matrix.x).toBe(10);
    expect(matrix.y).toBe(20);

    node.destroy();
  });

  test('changing rotation invalidates the cache and updates trig cache', () => {
    const node = new SceneNode();

    node.getTransform();

    const updateSpy = vi.spyOn(node, 'updateTransform');

    node.setRotation(90);

    const matrix = node.getTransform();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    // For a 90deg rotation with default scale 1 and origin 0,
    // matrix.a (scale.x * cos) ≈ 0, matrix.b (scale.y * sin) ≈ 1,
    // matrix.c (-scale.x * sin) ≈ -1, matrix.d (scale.y * cos) ≈ 0.
    expect(matrix.a).toBeCloseTo(0);
    expect(matrix.b).toBeCloseTo(1);
    expect(matrix.c).toBeCloseTo(-1);
    expect(matrix.d).toBeCloseTo(0);

    node.destroy();
  });

  test('changing scale via observable vector triggers dirty-flag callback', () => {
    const node = new SceneNode();

    node.getTransform();

    const updateSpy = vi.spyOn(node, 'updateTransform');

    // Mutate via the observable vector directly — confirms that the
    // ObservableVector → _setScalingDirty wiring survives the inline.
    node.scale.set(2, 3);

    const matrix = node.getTransform();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(matrix.a).toBeCloseTo(2);
    expect(matrix.d).toBeCloseTo(3);

    node.destroy();
  });

  test('changing origin via observable vector triggers dirty-flag callback', () => {
    const node = new SceneNode();

    node.setPosition(50, 60);
    node.getTransform();

    const updateSpy = vi.spyOn(node, 'updateTransform');

    node.origin.set(10, 20);

    const matrix = node.getTransform();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    // With no rotation: matrix.x = (origin.x * -scale.x) + position.x
    //                       = (10 * -1) + 50 = 40
    expect(matrix.x).toBe(40);
    expect(matrix.y).toBe(40);

    node.destroy();
  });
});

describe('SceneNode parent-chain composition', () => {
  test('getGlobalTransform composes local with parent global recursively', () => {
    const grandparent = new Container();
    const parent = new Container();
    const child = new TestDrawable();

    grandparent.setPosition(100, 200);
    parent.setPosition(10, 20);
    child.setPosition(1, 2);

    grandparent.addChild(parent);
    parent.addChild(child);

    const childGlobal = child.getGlobalTransform();

    // Final translation is the sum of the chain: 100+10+1, 200+20+2.
    expect(childGlobal.x).toBe(111);
    expect(childGlobal.y).toBe(222);

    child.destroy();
    parent.destroy();
    grandparent.destroy();
  });

  test('moving the parent updates the child global transform on next read', () => {
    const parent = new Container();
    const child = new TestDrawable();

    parent.addChild(child);
    parent.setPosition(0, 0);
    child.setPosition(5, 5);

    const beforeMove = child.getGlobalTransform();
    const beforeX = beforeMove.x;
    const beforeY = beforeMove.y;

    // Mutate parent — after the Slice 1 cascade fix, the child's own
    // GlobalTransform flag is never touched eagerly; the next
    // getGlobalTransform() on child must detect staleness lazily via the
    // parent-version compare and recombine.
    parent.setPosition(100, 200);

    const afterMove = child.getGlobalTransform();

    expect(afterMove.x).toBe(beforeX + 100);
    expect(afterMove.y).toBe(beforeY + 200);

    child.destroy();
    parent.destroy();
  });

  test('moving a container does not eagerly call _invalidateSubtreeTransform on a direct child', () => {
    const parent = new Container();
    const child = new TestDrawable();

    parent.addChild(child);

    const spy = vi.spyOn(child, '_invalidateSubtreeTransform');

    parent.setPosition(100, 200);

    expect(spy).not.toHaveBeenCalled();

    child.destroy();
    parent.destroy();
  });

  test('moving a distant ancestor does not eagerly touch a nested descendant, but the descendant still resolves correctly on next read', () => {
    const root = new Container();
    const mid = new Container();
    const leaf = new TestDrawable();

    root.addChild(mid);
    mid.addChild(leaf);
    leaf.setPosition(5, 5);
    leaf.getGlobalTransform(); // settle caches once

    const leafSpy = vi.spyOn(leaf, '_invalidateSubtreeTransform');
    const midSpy = vi.spyOn(mid, '_invalidateSubtreeTransform');

    root.setPosition(50, 50);

    expect(midSpy).not.toHaveBeenCalled();
    expect(leafSpy).not.toHaveBeenCalled();

    // Correctness: the lazy path must still resolve the new position exactly.
    expect(leaf.getGlobalTransform().x).toBe(55);
    expect(leaf.getGlobalTransform().y).toBe(55);

    leaf.destroy();
    mid.destroy();
    root.destroy();
  });

  test('updateParentTransform walks the entire ancestor chain', () => {
    const grandparent = new Container();
    const parent = new Container();
    const child = new TestDrawable();

    grandparent.addChild(parent);
    parent.addChild(child);

    const grandSpy = vi.spyOn(grandparent, 'updateTransform');
    const parentSpy = vi.spyOn(parent, 'updateTransform');
    const childSpy = vi.spyOn(child, 'updateTransform');

    child.updateParentTransform();

    // Each level in the chain must be updated. The chain walks up first
    // (via recursive updateParentTransform) then calls updateTransform
    // on each node on the way out.
    expect(grandSpy).toHaveBeenCalled();
    expect(parentSpy).toHaveBeenCalled();
    expect(childSpy).toHaveBeenCalled();

    child.destroy();
    parent.destroy();
    grandparent.destroy();
  });
});

describe('SceneNode bounds after transform changes', () => {
  test('getBounds reflects current position', () => {
    const drawable = new TestDrawable();

    drawable.setPosition(0, 0);

    const before = drawable.getBounds().clone();

    drawable.setPosition(50, 70);

    const after = drawable.getBounds();

    expect(after.x).toBe(before.x + 50);
    expect(after.y).toBe(before.y + 70);

    drawable.destroy();
  });

  test('getBounds aggregates child bounds in a Container', () => {
    const container = new Container();
    const childA = new TestDrawable();
    const childB = new TestDrawable();

    childA.setPosition(0, 0);
    childB.setPosition(200, 200);

    container.addChild(childA);
    container.addChild(childB);

    const bounds = container.getBounds();

    // childA spans (0,0)-(100,100); childB spans (200,200)-(300,300).
    // Aggregate is (0,0)-(300,300).
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(300);

    container.destroy();
  });
});

describe('SceneNode anchor → origin propagation', () => {
  test('setAnchor recomputes origin from current bounds', () => {
    const drawable = new TestDrawable();

    // Compute bounds once so the underlying _localBounds is materialized.
    drawable.getBounds();

    drawable.setAnchor(0.5, 0.5);

    // anchor 0.5 of a 100x100 local box → origin 50,50.
    expect(drawable.origin.x).toBe(50);
    expect(drawable.origin.y).toBe(50);

    drawable.destroy();
  });

  test('mutating anchor.x via observable vector recomputes origin', () => {
    const drawable = new TestDrawable();

    drawable.getBounds();

    drawable.anchor.x = 1;

    expect(drawable.origin.x).toBe(100);

    drawable.destroy();
  });
});

describe('SceneNode.destroy() releases all owned resources', () => {
  test('destroy is idempotent enough to call without throwing', () => {
    const node = new SceneNode();

    // Touch each resource so it is in a fully-initialized state.
    node.setPosition(1, 2);
    node.setRotation(45);
    node.setScale(2, 3);
    node.setOrigin(4, 5);
    node.getTransform();
    node.getGlobalTransform();
    node.getBounds();

    expect(() => node.destroy()).not.toThrow();
  });

  test('destroy releases transform, bounds, anchor, and flags resources', () => {
    const node = new SceneNode();

    node.getTransform();
    node.getBounds();

    const transformSpy = vi.spyOn(node['_transform'], 'destroy');
    const positionSpy = vi.spyOn(node['_position'], 'destroy');
    const scaleSpy = vi.spyOn(node['_scale'], 'destroy');
    const originSpy = vi.spyOn(node['_origin'], 'destroy');
    const flagsSpy = vi.spyOn(node.flags, 'destroy');
    const globalTransformSpy = vi.spyOn(node['_globalTransform'], 'destroy');
    const localBoundsSpy = vi.spyOn(node['_localBounds'], 'destroy');
    const boundsSpy = vi.spyOn(node['_bounds'], 'destroy');
    const anchorSpy = vi.spyOn(node['_anchor'], 'destroy');

    node.destroy();

    // All nine owned resources must be released. This guards against a
    // future refactor accidentally dropping a destroy call.
    expect(transformSpy).toHaveBeenCalledTimes(1);
    expect(positionSpy).toHaveBeenCalledTimes(1);
    expect(scaleSpy).toHaveBeenCalledTimes(1);
    expect(originSpy).toHaveBeenCalledTimes(1);
    expect(flagsSpy).toHaveBeenCalledTimes(1);
    expect(globalTransformSpy).toHaveBeenCalledTimes(1);
    expect(localBoundsSpy).toHaveBeenCalledTimes(1);
    expect(boundsSpy).toHaveBeenCalledTimes(1);
    expect(anchorSpy).toHaveBeenCalledTimes(1);
  });

  test('Container.destroy chains through SceneNode.destroy', () => {
    const container = new Container();

    container.getTransform();

    const positionSpy = vi.spyOn(container['_position'], 'destroy');

    // Container.destroy → super.destroy() → RenderNode.destroy() →
    // super.destroy() → SceneNode.destroy() → _position.destroy().
    container.destroy();

    expect(positionSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SceneNode getBounds caching contract', () => {
  test('getBounds returns the underlying rectangle reference (mutate-safe via clone())', () => {
    const drawable = new TestDrawable();

    drawable.setPosition(7, 11);

    const a = drawable.getBounds();
    const b = drawable.getBounds();

    // The returned Rectangle is the same instance — callers wanting a
    // snapshot must `.clone()`. This matches the pre-inline behavior.
    expect(a).toBe(b);

    drawable.destroy();
  });

  test('mask = Rectangle preserves snapshot semantics (one-shot, not live)', () => {
    // Assigning a Rectangle to mask captures it as a value. Mutating
    // the source node afterwards does not update the mask.
    const drawable = new TestDrawable();
    const source = new TestDrawable();

    source.setPosition(40, 50);

    const snapshot = source.getBounds().clone();

    drawable.mask = snapshot;

    source.setPosition(900, 900);

    // Snapshot is unaffected by the source moving.
    expect(drawable.mask).toBe(snapshot);
    expect((drawable.mask as Rectangle).x).not.toBe(source.getBounds().x);

    drawable.destroy();
    source.destroy();
  });
});

// ---------------------------------------------------------------------------
// Skew — API surface
// ---------------------------------------------------------------------------

describe('SceneNode.skewX / skewY / setSkew — API surface', () => {
  test('skewX setter assigns value; getter reads it back', () => {
    const node = new SceneNode();

    node.skewX = 15;

    expect(node.skewX).toBe(15);

    node.destroy();
  });

  test('skewY setter assigns value; getter reads it back', () => {
    const node = new SceneNode();

    node.skewY = -10;

    expect(node.skewY).toBe(-10);

    node.destroy();
  });

  test('setSkew(x, y) sets both axes independently', () => {
    const node = new SceneNode();

    node.setSkew(20, -5);

    expect(node.skewX).toBe(20);
    expect(node.skewY).toBe(-5);

    node.destroy();
  });

  test('setSkew(x) with single argument sets both axes (default-y = x convention)', () => {
    const node = new SceneNode();

    node.setSkew(12);

    expect(node.skewX).toBe(12);
    expect(node.skewY).toBe(12);

    node.destroy();
  });

  test('setSkew returns this for chaining', () => {
    const node = new SceneNode();

    expect(node.setSkew(5, 5)).toBe(node);

    node.destroy();
  });
});

// ---------------------------------------------------------------------------
// Skew — isAlignedBox gating
// ---------------------------------------------------------------------------

describe('SceneNode.isAlignedBox — skew gating', () => {
  test('true when rotation=0, skewX=0, skewY=0 (default state)', () => {
    const node = new SceneNode();

    expect(node.isAlignedBox).toBe(true);

    node.destroy();
  });

  test('true when rotation=90, skewX=0, skewY=0', () => {
    const node = new SceneNode();

    node.setRotation(90);

    expect(node.isAlignedBox).toBe(true);

    node.destroy();
  });

  test('false when skewX != 0, rotation=0', () => {
    const node = new SceneNode();

    node.skewX = 15;

    expect(node.isAlignedBox).toBe(false);

    node.destroy();
  });

  test('false when skewY != 0, rotation=0', () => {
    const node = new SceneNode();

    node.skewY = -5;

    expect(node.isAlignedBox).toBe(false);

    node.destroy();
  });

  test('false when skewX != 0 even when rotation is a multiple of 90°', () => {
    const node = new SceneNode();

    node.setRotation(90);
    node.skewX = 10;

    expect(node.isAlignedBox).toBe(false);

    node.destroy();
  });

  test('restoring skewX to 0 restores isAlignedBox to true', () => {
    const node = new SceneNode();

    node.skewX = 30;

    expect(node.isAlignedBox).toBe(false);

    node.skewX = 0;

    expect(node.isAlignedBox).toBe(true);

    node.destroy();
  });
});

// ---------------------------------------------------------------------------
// Skew — local transform matrix
// ---------------------------------------------------------------------------

describe('SceneNode.updateTransform() — skew matrix coefficients', () => {
  test('skewX=45°, rotation=0, scale=1: a=1, b=0, c=tan(45°)=1, d=1', () => {
    // tan(45°) = 1; with rotation=0: cos=1, sin=0.
    // a = sx*cos + tanKx*sin = 1*1 + 1*0 = 1
    // b = sy*sin + tanKy*cos = 1*0 + 0*1 = 0
    // c = -sx*sin + tanKx*cos = -0 + 1*1 = 1
    // d = -tanKy*sin + sy*cos = -0 + 1*1 = 1
    const node = new SceneNode();

    node.setSkew(45, 0);

    const m = node.getTransform();

    expect(m.a).toBeCloseTo(1);
    expect(m.b).toBeCloseTo(0);
    expect(m.c).toBeCloseTo(1);
    expect(m.d).toBeCloseTo(1);

    node.destroy();
  });

  test('skewY=45°, rotation=0, scale=1: a=1, b=tan(45°)=1, c=0, d=1', () => {
    // a = sx*cos + 0*sin = 1
    // b = sy*sin + tanKy*cos = 0 + 1*1 = 1
    // c = -sx*sin + 0*cos = 0
    // d = -tanKy*sin + sy*cos = -0 + 1*1 = 1
    const node = new SceneNode();

    node.setSkew(0, 45);

    const m = node.getTransform();

    expect(m.a).toBeCloseTo(1);
    expect(m.b).toBeCloseTo(1);
    expect(m.c).toBeCloseTo(0);
    expect(m.d).toBeCloseTo(1);

    node.destroy();
  });

  test('setSkew(0, 0) at rotation=30° produces the same matrix as no skew at rotation=30°', () => {
    const nodeSkew = new SceneNode();
    const nodeNoSkew = new SceneNode();

    nodeSkew.setSkew(0, 0);
    nodeSkew.setRotation(30);
    nodeNoSkew.setRotation(30);

    const mSkew = nodeSkew.getTransform();
    const mNoSkew = nodeNoSkew.getTransform();

    expect(mSkew.a).toBeCloseTo(mNoSkew.a);
    expect(mSkew.b).toBeCloseTo(mNoSkew.b);
    expect(mSkew.c).toBeCloseTo(mNoSkew.c);
    expect(mSkew.d).toBeCloseTo(mNoSkew.d);
    expect(mSkew.x).toBeCloseTo(mNoSkew.x);
    expect(mSkew.y).toBeCloseTo(mNoSkew.y);

    nodeSkew.destroy();
    nodeNoSkew.destroy();
  });
});

// ---------------------------------------------------------------------------
// Skew — dirty-flag / lazy recomputation
// ---------------------------------------------------------------------------

describe('SceneNode skew — dirty-flag invalidation', () => {
  test('setting skewX invalidates cache; getTransform recomputes lazily', () => {
    const node = new SceneNode();

    node.getTransform(); // settle cache

    const updateSpy = vi.spyOn(node, 'updateTransform');

    node.skewX = 30;

    expect(updateSpy).not.toHaveBeenCalled(); // lazy — no eager recompute

    node.getTransform();

    expect(updateSpy).toHaveBeenCalledTimes(1);

    node.destroy();
  });

  test('setting skewX to same value is a no-op and does not dirty the cache', () => {
    const node = new SceneNode();

    node.setSkew(0, 0);
    node.getTransform(); // settle cache

    const updateSpy = vi.spyOn(node, 'updateTransform');

    node.skewX = 0;
    node.skewY = 0;
    node.getTransform();

    expect(updateSpy).not.toHaveBeenCalled();

    node.destroy();
  });

  test('setting skewX propagates GlobalTransform invalidation to child', () => {
    const parent = new Container();
    const child = new TestDrawable();

    parent.addChild(child);
    parent.setSkew(0, 0);
    child.setPosition(10, 10);

    // Save the numeric c value before mutation. getGlobalTransform() returns the
    // same mutable matrix reference each call, so we capture the primitive number.
    const cBefore = child.getGlobalTransform().c;

    parent.skewX = 45;

    // After invalidation the global transform must recompute.
    // Parent skewX=45°: local matrix c = tan(45°)·cos(0°) = 1.
    // Child global c includes parent's contribution → also ≈ 1.
    const cAfter = child.getGlobalTransform().c;

    expect(cAfter).toBeCloseTo(1);
    expect(cAfter).not.toBeCloseTo(cBefore);

    parent.destroy();
  });
});

// ---------------------------------------------------------------------------
// Skew — bounds under shear
// ---------------------------------------------------------------------------

describe('SceneNode skew — bounds under shear', () => {
  test('skewX=45° on a 100×100 box doubles the bounds height', () => {
    const drawable = new TestDrawable();

    drawable.setPosition(0, 0);

    const unskewedHeight = drawable.getBounds().height;

    drawable.setSkew(45, 0);

    const skewedHeight = drawable.getBounds().height;

    // A 100×100 box with skewX=45° (tanKx=1) transforms to a parallelogram
    // spanning 200px vertically: AABB height goes from 100 to 200.
    expect(skewedHeight).toBeCloseTo(unskewedHeight * 2, 0);

    drawable.destroy();
  });

  test('skewY=45° on a 100×100 box doubles the bounds width', () => {
    const drawable = new TestDrawable();

    drawable.setPosition(0, 0);

    const unskewedWidth = drawable.getBounds().width;

    drawable.setSkew(0, 45);

    const skewedWidth = drawable.getBounds().width;

    // skewY=45° (tanKy=1) shears horizontally: AABB width goes from 100 to 200.
    expect(skewedWidth).toBeCloseTo(unskewedWidth * 2, 0);

    drawable.destroy();
  });

  test('skew invalidation updates bounds on next getBounds call', () => {
    const drawable = new TestDrawable();

    drawable.setPosition(0, 0);

    const initial = drawable.getBounds().clone();

    drawable.setSkew(45, 0);

    const after = drawable.getBounds();

    expect(after.height).not.toBeCloseTo(initial.height);

    drawable.destroy();
  });
});
