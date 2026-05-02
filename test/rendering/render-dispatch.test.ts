import { ParticleSystem } from '@/particles/ParticleSystem';
import { Drawable } from '@/rendering/Drawable';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { Container } from '@/rendering/Container';
import { Mesh } from '@/rendering/mesh/Mesh';
import { RenderTexture } from '@/rendering/texture/RenderTexture';

const createRuntime = () => {
    const renderTarget = new RenderTarget(200, 200, true);
    const stats = createRenderStats();
    const draw = jest.fn(function(this: RenderBackend) {
        return this;
    });
    const runtime: RenderBackend = {
        backendType: RenderBackendType.WebGl2,
        stats,
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
        pushScissorRect() {
            return this;
        },
        popScissorRect() {
            return this;
        },
        composeWithAlphaMask() {
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
        resetStats() {
            resetRenderStats(stats);

            return this;
        },
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
    public override render(backend: RenderBackend): this {
        backend.draw(this);

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

    test('Mesh.render submits through runtime.draw', () => {
        const { runtime, draw } = createRuntime();
        const mesh = new Mesh({ vertices: new Float32Array([0, 0, 10, 0, 10, 10]) });

        mesh.render(runtime);

        expect(draw).toHaveBeenCalledWith(mesh);
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

    test('culls clearly offscreen drawable content by default', () => {
        const { runtime, draw } = createRuntime();
        const drawable = new Drawable();

        drawable.getLocalBounds().set(0, 0, 16, 16);
        drawable.setPosition(1000, 1000);
        drawable.render(runtime);

        expect(draw).not.toHaveBeenCalled();
        expect(runtime.stats.culledNodes).toBe(1);
    });

    test('allows culling opt-out for always-render nodes', () => {
        const { runtime, draw } = createRuntime();
        const drawable = new Drawable();

        drawable.getLocalBounds().set(0, 0, 16, 16);
        drawable.setPosition(1000, 1000);
        drawable.setCullable(false);
        drawable.render(runtime);

        expect(draw).toHaveBeenCalledWith(drawable);
        expect(runtime.stats.culledNodes).toBe(0);
    });

    test('culls offscreen containers without traversing children', () => {
        const { runtime, draw } = createRuntime();
        const container = new Container();
        const child = new Drawable();

        child.getLocalBounds().set(0, 0, 16, 16);
        container.setPosition(500, 500);
        container.addChild(child);
        container.render(runtime);

        expect(draw).not.toHaveBeenCalled();
        expect(runtime.stats.culledNodes).toBe(1);
    });

    test('updates culling results when view changes', () => {
        const { runtime, draw } = createRuntime();
        const drawable = new Drawable();

        drawable.getLocalBounds().set(0, 0, 16, 16);
        drawable.setPosition(260, 100);
        runtime.resetStats();
        drawable.render(runtime);

        expect(draw).not.toHaveBeenCalled();
        expect(runtime.stats.culledNodes).toBe(1);

        draw.mockClear();
        runtime.resetStats();
        runtime.view.setCenter(260, 100);
        drawable.render(runtime);

        expect(draw).toHaveBeenCalledWith(drawable);
        expect(runtime.stats.culledNodes).toBe(0);
    });
});
