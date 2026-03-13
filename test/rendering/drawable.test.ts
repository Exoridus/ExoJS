import { Drawable } from 'rendering/Drawable';
import { Container } from 'rendering/Container';
import { SceneNode } from 'core/SceneNode';
import type { Color } from 'core/Color';
import type { RenderManager } from 'rendering/RenderManager';

class DummyDrawable extends Drawable {
    public render(_renderManager: RenderManager): this {
        return this;
    }
}

describe('Drawable', () => {
    test('is the renderable specialization on top of SceneNode, not Container', () => {
        const drawable = new DummyDrawable();

        expect(drawable).toBeInstanceOf(SceneNode);
        expect(drawable).not.toBeInstanceOf(Container);
    });

    test('setTint ignores undefined payloads', () => {
        const drawable = new DummyDrawable();
        const before = drawable.tint.clone();

        drawable.setTint(undefined as unknown as Color);

        expect(drawable.tint.equals(before)).toBe(true);
    });
});
