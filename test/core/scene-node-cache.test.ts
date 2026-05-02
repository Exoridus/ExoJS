import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { Rectangle } from '@/math/Rectangle';
import type { RenderBackend } from '@/rendering/RenderBackend';

// A concrete Drawable with a configurable local-bounds size.
class TestDrawable extends Drawable {
    private _localWidth: number;
    private _localHeight: number;

    public constructor(w = 100, h = 100) {
        super();
        this._localWidth = w;
        this._localHeight = h;
        this.getLocalBounds().set(0, 0, w, h);
    }

    public setLocalSize(w: number, h: number): void {
        this._localWidth = w;
        this._localHeight = h;
        this.getLocalBounds().set(0, 0, w, h);
        this._invalidateBoundsCascade();
    }

    public override render(_backend: RenderBackend): this {
        return this;
    }
}

// ---------------------------------------------------------------------------
// GlobalTransform caching
// ---------------------------------------------------------------------------

describe('SceneNode.getGlobalTransform() — dirty-flag cache', () => {
    test('cache hit: repeated calls without mutation do not recompute', () => {
        const node = new TestDrawable();

        node.setPosition(10, 20);

        const gt1 = node.getGlobalTransform();
        const combineSpy = jest.spyOn(node['_globalTransform'], 'combine');
        const copySpy = jest.spyOn(node['_globalTransform'], 'copy');

        // 9 more reads — cache should be warm, no recomputation.
        for (let i = 0; i < 9; i++) {
            node.getGlobalTransform();
        }

        expect(combineSpy).not.toHaveBeenCalled();
        expect(copySpy).not.toHaveBeenCalled();
        expect(node.getGlobalTransform()).toBe(gt1);

        node.destroy();
    });

    test('cache invalidation on self: setPosition updates global transform', () => {
        const node = new TestDrawable();

        node.setPosition(5, 10);
        const gt1x = node.getGlobalTransform().x;
        const gt1y = node.getGlobalTransform().y;

        node.setPosition(50, 100);
        const gt2 = node.getGlobalTransform();

        expect(gt2.x).not.toBe(gt1x);
        expect(gt2.x).toBeCloseTo(50);
        expect(gt2.y).toBeCloseTo(100);

        node.destroy();
    });

    test('cache invalidation on parent: parent setPosition propagates to child', () => {
        const parent = new Container();
        const child = new TestDrawable();

        parent.addChild(child);
        parent.setPosition(0, 0);
        child.setPosition(5, 5);

        const beforeX = child.getGlobalTransform().x;
        const beforeY = child.getGlobalTransform().y;

        parent.setPosition(100, 200);

        const afterGt = child.getGlobalTransform();

        expect(afterGt.x).toBeCloseTo(beforeX + 100);
        expect(afterGt.y).toBeCloseTo(beforeY + 200);

        child.destroy();
        parent.destroy();
    });

    test('deep ancestry: grandparent move propagates through chain', () => {
        const grandparent = new Container();
        const parent = new Container();
        const child = new TestDrawable();

        grandparent.addChild(parent);
        parent.addChild(child);
        grandparent.setPosition(100, 200);
        parent.setPosition(10, 20);
        child.setPosition(1, 2);

        expect(child.getGlobalTransform().x).toBeCloseTo(111);
        expect(child.getGlobalTransform().y).toBeCloseTo(222);

        grandparent.setPosition(0, 0);

        expect(child.getGlobalTransform().x).toBeCloseTo(11);
        expect(child.getGlobalTransform().y).toBeCloseTo(22);

        child.destroy();
        parent.destroy();
        grandparent.destroy();
    });
});

// ---------------------------------------------------------------------------
// Bounds caching
// ---------------------------------------------------------------------------

describe('SceneNode.getBounds() — dirty-flag cache', () => {
    test('cache hit: repeated calls without mutation return same Rectangle reference', () => {
        const node = new TestDrawable();

        node.setPosition(0, 0);

        const b1 = node.getBounds();
        const b2 = node.getBounds();
        const b3 = node.getBounds();

        expect(b1).toBe(b2);
        expect(b2).toBe(b3);

        node.destroy();
    });

    test('cache invalidation: setPosition updates bounds on next read', () => {
        const node = new TestDrawable();

        node.setPosition(0, 0);
        const b1x = node.getBounds().x;

        node.setPosition(50, 70);
        const b2 = node.getBounds();

        expect(b2.x).toBeCloseTo(b1x + 50);
        expect(b2.y).toBeCloseTo(70);

        node.destroy();
    });

    test('bounds cascade to ancestor: child.setPosition invalidates parent.getBounds()', () => {
        const parent = new Container();
        const child = new TestDrawable(50, 50);

        parent.addChild(child);
        child.setPosition(0, 0);

        const parentBoundsW1 = parent.getBounds().width;

        child.setPosition(200, 200);
        const parentBoundsAfter = parent.getBounds();

        expect(parentBoundsAfter.width).toBeGreaterThan(parentBoundsW1);

        parent.destroy();
    });

    test('bounds cascade on local-bounds change: setLocalSize propagates to parent', () => {
        const parent = new Container();
        const child = new TestDrawable(50, 50);

        parent.addChild(child);
        child.setPosition(0, 0);

        const parentW1 = parent.getBounds().width;

        child.setLocalSize(200, 200);
        const parentW2 = parent.getBounds().width;

        expect(parentW2).toBeGreaterThan(parentW1);

        parent.destroy();
    });

    test('addChild invalidates child global transform', () => {
        const parent = new Container();
        const child = new TestDrawable();

        parent.setPosition(100, 200);

        // Child is detached — global is identity (pos 0,0).
        child.setPosition(0, 0);
        const detachedGtX = child.getGlobalTransform().x;

        parent.addChild(child);

        // After attaching to a translated parent, global x must shift.
        const attachedGtX = child.getGlobalTransform().x;

        expect(attachedGtX).not.toBe(detachedGtX);
        expect(attachedGtX).toBeCloseTo(100);

        child.destroy();
        parent.destroy();
    });

    test('removeChild invalidates ex-parent bounds', () => {
        const parent = new Container();
        const childA = new TestDrawable(100, 100);
        const childB = new TestDrawable(100, 100);

        childA.setPosition(0, 0);
        childB.setPosition(500, 500);

        parent.addChild(childA);
        parent.addChild(childB);

        const boundsWithBoth = parent.getBounds();
        const widthWithBoth = boundsWithBoth.width;

        parent.removeChild(childB);

        const boundsAfterRemove = parent.getBounds();

        expect(boundsAfterRemove.width).toBeLessThan(widthWithBoth);

        parent.destroy();
    });
});
