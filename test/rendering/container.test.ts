import { Container } from 'rendering/Container';
import { Drawable } from 'rendering/Drawable';
import { SceneNode } from 'core/SceneNode';
import { Graphics } from 'rendering/primitives/Graphics';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';

class DummyDrawable extends Drawable {
    public render(_renderManager: SceneRenderRuntime): this {
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

    test('sorts children by zIndex when sortableChildren is enabled', () => {
        const container = new Container();
        const first = new DummyDrawable();
        const second = new DummyDrawable();
        const third = new DummyDrawable();

        first.zIndex = 10;
        second.zIndex = 0;
        third.zIndex = 10;

        container.sortableChildren = true;
        container.addChild(first);
        container.addChild(second);
        container.addChild(third);

        container.sortChildren();

        expect(container.children).toEqual([second, first, third]);
    });

    test('keeps insertion order when sortableChildren is disabled', () => {
        const container = new Container();
        const first = new DummyDrawable();
        const second = new DummyDrawable();

        first.zIndex = 100;
        second.zIndex = 0;

        container.addChild(first);
        container.addChild(second);
        container.sortChildren();

        expect(container.children).toEqual([first, second]);
    });

    test('does not resort unchanged trees repeatedly', () => {
        const container = new Container();
        const first = new DummyDrawable();
        const second = new DummyDrawable();

        first.zIndex = 5;
        second.zIndex = 1;

        container.sortableChildren = true;
        container.addChild(first);
        container.addChild(second);

        const sortSpy = jest.spyOn(container.children, 'sort');

        container.sortChildren();
        container.sortChildren();

        expect(sortSpy).toHaveBeenCalledTimes(1);
    });
});
