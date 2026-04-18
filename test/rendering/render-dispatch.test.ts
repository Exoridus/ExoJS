import { Color } from 'core/Color';
import { ParticleSystem } from 'particles/ParticleSystem';
import { Drawable } from 'rendering/Drawable';
import { RenderBackendType } from 'rendering/RenderBackendType';
import { RenderTarget } from 'rendering/RenderTarget';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Sprite } from 'rendering/sprite/Sprite';
import { Texture } from 'rendering/texture/Texture';
import { Container } from 'rendering/Container';
import { DrawableShape } from 'rendering/primitives/DrawableShape';
import { Geometry } from 'rendering/primitives/Geometry';
import { RenderTexture } from 'rendering/texture/RenderTexture';

const createRuntime = () => {
    const renderTarget = new RenderTarget(200, 200, true);
    const draw = jest.fn(function(this: SceneRenderRuntime) {
        return this;
    });
    const runtime: SceneRenderRuntime = {
        backendType: RenderBackendType.WebGl2,
        renderTarget,
        get view() {
            return renderTarget.view;
        },
        async initialize() {
            return this;
        },
        clear() {
            return this;
        },
        resize(width: number, height: number) {
            renderTarget.resize(width, height);

            return this;
        },
        setView(view) {
            renderTarget.setView(view);

            return this;
        },
        setRenderTarget() {
            return this;
        },
        pushMask() {
            return this;
        },
        popMask() {
            return this;
        },
        acquireRenderTexture(width: number, height: number) {
            return new RenderTexture(width, height);
        },
        releaseRenderTexture(texture: RenderTexture) {
            texture.destroy();

            return this;
        },
        draw,
        execute() {
            return this;
        },
        flush() {
            return this;
        },
        destroy() {
            renderTarget.destroy();
        },
    };

    return { runtime, draw };
};

const createTexture = (): Texture => {
    const canvas = document.createElement('canvas');

    canvas.width = 32;
    canvas.height = 32;

    return new Texture(canvas);
};

class ChildDrawable extends Drawable {
    public render(renderManager: SceneRenderRuntime): this {
        renderManager.draw(this);

        return this;
    }
}

describe('render dispatch', () => {
    test('Sprite.render submits through runtime.draw', () => {
        const { runtime, draw } = createRuntime();
        const sprite = new Sprite(createTexture());

        sprite.render(runtime);

        expect(draw).toHaveBeenCalledWith(sprite);
    });

    test('DrawableShape.render submits through runtime.draw', () => {
        const { runtime, draw } = createRuntime();
        const shape = new DrawableShape(new Geometry({ vertices: [0, 0, 10, 0, 10, 10] }), Color.white);

        shape.render(runtime);

        expect(draw).toHaveBeenCalledWith(shape);
    });

    test('ParticleSystem.render submits through runtime.draw', () => {
        const { runtime, draw } = createRuntime();
        const system = new ParticleSystem(createTexture());

        system.render(runtime);

        expect(draw).toHaveBeenCalledWith(system);
    });

    test('Container.render remains traversal-only', () => {
        const { runtime, draw } = createRuntime();
        const container = new Container();
        const child = new ChildDrawable();

        container.addChild(child);
        container.render(runtime);

        expect(draw).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledWith(child);
        expect(draw).not.toHaveBeenCalledWith(container);
    });
});
