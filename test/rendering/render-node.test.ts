import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { RenderNode } from '@/rendering/RenderNode';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { SceneNode } from '@/core/SceneNode';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import type { RenderBackend } from '@/rendering/RenderBackend';

class TestDrawable extends Drawable {}

const createRuntime = (): RenderBackend => {
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

describe('RenderNode and SceneNode contract', () => {
    test('bare SceneNode has no render method', () => {
        const node = new SceneNode();

        // SceneNode is purely structural after the 0.5.0 hierarchy slice.
        // The render contract belongs to RenderNode and below; SceneNode
        // does not declare or inherit a render() method.
        expect((node as { render?: unknown }).render).toBeUndefined();

        node.destroy();
    });

    test('RenderNode is abstract — direct instantiation is not possible', () => {
        // RenderNode is declared `abstract` and `render` is `abstract`.
        // TypeScript prevents `new RenderNode()` at compile time. At runtime,
        // a forced-cast construction would produce an object that fails the
        // first time render() is called, because there is no concrete impl.
        const RenderNodeCtor = RenderNode as unknown as new () => RenderNode;
        const instance = new RenderNodeCtor();

        // The instance has no render implementation — it's typed as a method
        // but the abstract declaration provides no body.
        expect(instance.render).toBeUndefined();

        instance.destroy();
    });

    test('Drawable is a concrete RenderNode and renders by submitting to runtime.draw', () => {
        const runtime = createRuntime();
        const drawable = new TestDrawable();
        const draw = jest.spyOn(runtime, 'draw');

        drawable.render(runtime);

        expect(draw).toHaveBeenCalledWith(drawable);

        drawable.destroy();
        runtime.destroy();
    });

    test('Container is a concrete RenderNode and traverses RenderNode children', () => {
        const runtime = createRuntime();
        const container = new Container();
        const child = new TestDrawable();
        const childRender = jest.spyOn(child, 'render');

        container.addChild(child);
        container.render(runtime);

        expect(childRender).toHaveBeenCalledWith(runtime);

        container.destroy();
        runtime.destroy();
    });

    test('Container.addChild parameter type is RenderNode (compile-time enforcement)', () => {
        const container = new Container();
        const drawable = new TestDrawable();

        // Adding a RenderNode subclass is allowed.
        container.addChild(drawable);

        // The line below is a compile error in TypeScript; we keep it as a
        // ts-expect-error sentinel so the constraint cannot be silently
        // weakened in a future refactor.
        const bareNode = new SceneNode();
        // @ts-expect-error — Container.addChild requires a RenderNode, not a bare SceneNode.
        container.addChild(bareNode);

        // Runtime fallback: even though the cast went through above, the bare
        // SceneNode lacks a render() method, so traversal would throw on the
        // missing call. We do not exercise render() here because the contract
        // we are protecting is the type-level one.
        bareNode.destroy();
        container.destroy();
    });
});
