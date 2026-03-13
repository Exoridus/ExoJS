import { Container } from 'rendering/Container';
import { Drawable } from 'rendering/Drawable';
import { SceneNode } from 'core/SceneNode';
import { Graphics } from 'rendering/primitives/Graphics';
import type { RenderManager } from 'rendering/RenderManager';

class DummyDrawable extends Drawable {
    public render(_renderManager: RenderManager): this {
        return this;
    }
}

describe('Container', () => {
    test('is a non-renderable scene node, not a drawable', () => {
        const container = new Container();

        expect(container).toBeInstanceOf(SceneNode);
        expect(container).not.toBeInstanceOf(Drawable);
    });

    test('Graphics remains a Container-based grouping node', () => {
        const graphics = new Graphics();

        expect(graphics).toBeInstanceOf(Container);
        expect(graphics).not.toBeInstanceOf(Drawable);
    });

    test('swapChildren swaps positions correctly', () => {
        const container = new Container();
        const first = new DummyDrawable();
        const second = new DummyDrawable();

        container.addChild(first);
        container.addChild(second);
        container.swapChildren(first, second);

        expect(container.getChildAt(0)).toBe(second);
        expect(container.getChildAt(1)).toBe(first);
    });

    test('removeChildAt clears parent reference', () => {
        const container = new Container();
        const child = new DummyDrawable();

        container.addChild(child);
        container.removeChildAt(0);

        expect(child.parent).toBeNull();
        expect(container.children.length).toBe(0);
    });

    test('removeChildren clears parent references in range', () => {
        const container = new Container();
        const first = new DummyDrawable();
        const second = new DummyDrawable();
        const third = new DummyDrawable();

        container.addChild(first);
        container.addChild(second);
        container.addChild(third);

        container.removeChildren(0, 2);

        expect(first.parent).toBeNull();
        expect(second.parent).toBeNull();
        expect(third.parent).toBe(container);
        expect(container.children.length).toBe(1);
    });
});
