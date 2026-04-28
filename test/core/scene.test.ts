import { Scene } from '@/core/Scene';
import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { SceneRenderRuntime } from '@/rendering/SceneRenderRuntime';

class DummyDrawable extends Drawable {}

const createRuntime = (): SceneRenderRuntime => {
    const renderTarget = new RenderTarget(200, 200, true);
    const stats = createRenderStats();

    return {
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
        draw() {
            return this;
        },
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
};

describe('Scene', () => {
    test('owns a root container by default', () => {
        const scene = new Scene();

        expect(scene.root).toBeInstanceOf(Container);
    });

    test('addChild and removeChild delegate to root', () => {
        const scene = new Scene();
        const child = new DummyDrawable();

        scene.addChild(child);

        expect(scene.root.children).toContain(child);
        expect(child.parentNode).toBe(scene.root);

        scene.removeChild(child);

        expect(scene.root.children).not.toContain(child);
        expect(child.parentNode).toBeNull();
    });

    // CONTRACT — do not weaken without an explicit identity decision.
    //
    // Scene.root is a structural ownership/traversal anchor. The
    // framework must never auto-render it. This test pins down the
    // "explicit instead of implicit" identity rule: Scene.draw is the
    // user's selection point, and rendering happens only when the user
    // calls render() on the chosen subtree.
    //
    // See docs/api/Scene.md#scene-root-contract.
    test('draw(runtime) remains the explicit rendering orchestration point', () => {
        const runtime = createRuntime();
        const scene = new Scene();
        const world = new Container();
        const ui = new Container();
        const worldSprite = new DummyDrawable();
        const uiSprite = new DummyDrawable();
        const worldRender = jest.spyOn(world, 'render');
        const uiRender = jest.spyOn(ui, 'render');

        world.addChild(worldSprite);
        ui.addChild(uiSprite);
        scene.addChild(world);
        scene.addChild(ui);

        scene.draw = (renderManager): void => {
            world.render(renderManager);
        };

        scene.draw(runtime);

        expect(worldRender).toHaveBeenCalledWith(runtime);
        expect(uiRender).not.toHaveBeenCalled();
    });
});
