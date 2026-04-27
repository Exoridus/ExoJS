import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';
import { SceneNode } from '@/core/SceneNode';

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
        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        const updateSpy = jest.spyOn(node, 'updateTransform');

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

        // Mutate parent — child has no flag-push of its own, but the next
        // getGlobalTransform() on child must re-read parent's world transform.
        parent.setPosition(100, 200);

        const afterMove = child.getGlobalTransform();

        expect(afterMove.x).toBe(beforeX + 100);
        expect(afterMove.y).toBe(beforeY + 200);

        child.destroy();
        parent.destroy();
    });

    test('updateParentTransform walks the entire ancestor chain', () => {
        const grandparent = new Container();
        const parent = new Container();
        const child = new TestDrawable();

        grandparent.addChild(parent);
        parent.addChild(child);

        const grandSpy = jest.spyOn(grandparent, 'updateTransform');
        const parentSpy = jest.spyOn(parent, 'updateTransform');
        const childSpy = jest.spyOn(child, 'updateTransform');

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

        const transformSpy = jest.spyOn(node['_transform'], 'destroy');
        const positionSpy = jest.spyOn(node['_position'], 'destroy');
        const scaleSpy = jest.spyOn(node['_scale'], 'destroy');
        const originSpy = jest.spyOn(node['_origin'], 'destroy');
        const flagsSpy = jest.spyOn(node.flags, 'destroy');
        const globalTransformSpy = jest.spyOn(node['_globalTransform'], 'destroy');
        const localBoundsSpy = jest.spyOn(node['_localBounds'], 'destroy');
        const boundsSpy = jest.spyOn(node['_bounds'], 'destroy');
        const anchorSpy = jest.spyOn(node['_anchor'], 'destroy');

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

        const positionSpy = jest.spyOn(container['_position'], 'destroy');

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
