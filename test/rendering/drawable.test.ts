import { Drawable } from 'rendering/Drawable';
import { Color } from 'core/Color';
import type { RenderManager } from 'rendering/RenderManager';

class DummyDrawable extends Drawable {
    public render(_renderManager: RenderManager): this {
        return this;
    }
}

describe('Drawable', () => {
    test('setTint ignores undefined payloads', () => {
        const drawable = new DummyDrawable();
        const before = drawable.tint.clone();

        drawable.setTint(undefined as unknown as Color);

        expect(drawable.tint.equals(before)).toBe(true);
    });
});
