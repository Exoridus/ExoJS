import { Color } from '@/core/Color';
import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { Rectangle } from '@/math/Rectangle';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { Graphics } from '@/rendering/primitives/Graphics';
import { Sprite } from '@/rendering/sprite/Sprite';
import { SceneNode } from '@/core/SceneNode';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import type { SceneRenderRuntime } from '@/rendering/SceneRenderRuntime';
import type { BlendModes } from '@/rendering/types';

class TestDrawable extends Drawable {

    public override updateBounds(): this {
        // Give the drawable a non-zero local extent so getBounds() returns
        // a usable rectangle for the alpha-mask pipeline.
        this.getLocalBounds().set(0, 0, 64, 48);

        return super.updateBounds();
    }
}

interface MaskComposeCall {
    content: Texture | RenderTexture;
    mask: Texture | RenderTexture;
    x: number;
    y: number;
    width: number;
    height: number;
    blendMode: BlendModes;
}

interface MockRuntime {
    runtime: SceneRenderRuntime;
    scissorEvents: Array<string>;
    composeCalls: Array<MaskComposeCall>;
    drawCalls: Array<unknown>;
}

const createRuntime = (): MockRuntime => {
    const root = new RenderTarget(320, 200, true);
    let currentTarget: RenderTarget = root;
    const stats = createRenderStats();
    const scissorEvents: Array<string> = [];
    const composeCalls: Array<MaskComposeCall> = [];
    const drawCalls: Array<unknown> = [];

    const runtime: SceneRenderRuntime = {
        backendType: RenderBackendType.WebGl2,
        stats,
        get renderTarget() {
            return currentTarget;
        },
        get view() {
            return currentTarget.view;
        },
        async initialize() {
            return this;
        },
        clear() {
            return this;
        },
        resize(width: number, height: number) {
            root.resize(width, height);

            return this;
        },
        setView(view) {
            currentTarget.setView(view);

            return this;
        },
        setRenderTarget(target) {
            currentTarget = target ?? root;

            return this;
        },
        pushScissorRect() {
            scissorEvents.push('push');

            return this;
        },
        popScissorRect() {
            scissorEvents.push('pop');

            return this;
        },
        composeWithAlphaMask(content, mask, x, y, width, height, blendMode) {
            composeCalls.push({ content, mask, x, y, width, height, blendMode });

            return this;
        },
        acquireRenderTexture(width: number, height: number) {
            return new RenderTexture(width, height);
        },
        releaseRenderTexture(texture: RenderTexture) {
            texture.destroy();

            return this;
        },
        draw(drawable) {
            drawCalls.push(drawable);

            return this;
        },
        execute(pass) {
            // Execute the pass synchronously so RenderNode's intermediate
            // RT writes are visible to subsequent assertions.
            pass.execute(this);

            return this;
        },
        resetStats() {
            resetRenderStats(stats);

            return this;
        },
        flush() {
            return this;
        },
        destroy() {
            root.destroy();
        },
    };

    return { runtime, scissorEvents, composeCalls, drawCalls };
};

const createTexture = (width = 16, height = 16): Texture => {
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    return new Texture(canvas);
};

describe('RenderNode.mask — MaskSource union', () => {
    describe('Rectangle source', () => {
        test('routes scissor push/pop around the masked render', () => {
            const { runtime, scissorEvents, composeCalls } = createRuntime();
            const drawable = new TestDrawable();

            drawable.mask = new Rectangle(5, 8, 32, 24);
            drawable.render(runtime);

            expect(scissorEvents).toEqual(['push', 'pop']);
            expect(composeCalls).toHaveLength(0);

            drawable.destroy();
        });

        test('nested rectangle masks produce balanced push/pop ordering', () => {
            const { runtime, scissorEvents } = createRuntime();
            const container = new Container();
            const child = new TestDrawable();

            container.mask = new Rectangle(0, 0, 100, 100);
            child.mask = new Rectangle(10, 10, 40, 40);
            container.addChild(child);
            container.render(runtime);

            expect(scissorEvents).toEqual(['push', 'push', 'pop', 'pop']);

            container.destroy();
        });

        test('zero-size rectangle mask renders nothing (no scissor, no compose)', () => {
            const { runtime, scissorEvents, composeCalls, drawCalls } = createRuntime();
            const drawable = new TestDrawable();

            drawable.mask = new Rectangle(0, 0, 0, 0);
            drawable.render(runtime);

            expect(scissorEvents).toEqual([]);
            expect(composeCalls).toEqual([]);
            expect(drawCalls).toEqual([]);

            drawable.destroy();
        });

        test('null mask skips both scissor and compose paths', () => {
            const { runtime, scissorEvents, composeCalls, drawCalls } = createRuntime();
            const drawable = new TestDrawable();

            drawable.mask = null;
            drawable.render(runtime);

            expect(scissorEvents).toEqual([]);
            expect(composeCalls).toEqual([]);
            expect(drawCalls).toHaveLength(1);

            drawable.destroy();
        });
    });

    describe('Texture source', () => {
        test('routes content through composeWithAlphaMask with the texture as mask source', () => {
            const { runtime, composeCalls, scissorEvents } = createRuntime();
            const drawable = new TestDrawable();
            const maskTex = createTexture();

            drawable.mask = maskTex;
            drawable.render(runtime);

            expect(scissorEvents).toEqual([]);
            expect(composeCalls).toHaveLength(1);
            expect(composeCalls[0].mask).toBe(maskTex);

            drawable.destroy();
            maskTex.destroy();
        });
    });

    describe('RenderTexture source', () => {
        test('accepts a RenderTexture as the mask source', () => {
            const { runtime, composeCalls } = createRuntime();
            const drawable = new TestDrawable();
            const maskRT = new RenderTexture(32, 32);

            drawable.mask = maskRT;
            drawable.render(runtime);

            expect(composeCalls).toHaveLength(1);
            expect(composeCalls[0].mask).toBe(maskRT);

            drawable.destroy();
            maskRT.destroy();
        });
    });

    describe('RenderNode source', () => {
        test('Sprite mask: bakes mask node to an intermediate RT before compose', () => {
            const { runtime, composeCalls } = createRuntime();
            const drawable = new TestDrawable();
            const tex = createTexture();
            const maskSprite = new Sprite(tex);

            drawable.mask = maskSprite;
            drawable.render(runtime);

            expect(composeCalls).toHaveLength(1);
            // The mask passed to compose is an intermediate RT, NOT the
            // sprite — proving the mask node was rendered into a texture
            // first.
            expect(composeCalls[0].mask).toBeInstanceOf(RenderTexture);
            expect(composeCalls[0].mask).not.toBe(tex);

            drawable.destroy();
            maskSprite.destroy();
            tex.destroy();
        });

        test('Graphics mask is accepted as a RenderNode source', () => {
            const { runtime, composeCalls } = createRuntime();
            const drawable = new TestDrawable();
            const maskGraphics = new Graphics();

            maskGraphics.fillColor = Color.white;
            maskGraphics.drawRectangle(0, 0, 32, 24);

            drawable.mask = maskGraphics;
            drawable.render(runtime);

            expect(composeCalls).toHaveLength(1);

            drawable.destroy();
            maskGraphics.destroy();
        });

        test('Container mask is accepted as a RenderNode source', () => {
            const { runtime, composeCalls } = createRuntime();
            const drawable = new TestDrawable();
            const maskContainer = new Container();
            const maskChild = new TestDrawable();

            maskContainer.addChild(maskChild);

            drawable.mask = maskContainer;
            drawable.render(runtime);

            expect(composeCalls).toHaveLength(1);

            drawable.destroy();
            maskContainer.destroy();
        });
    });

    describe('compile-time + runtime guards', () => {
        test('bare SceneNode is rejected at compile time as a MaskSource', () => {
            const drawable = new TestDrawable();
            const bare = new SceneNode();

            // @ts-expect-error — bare SceneNode is not assignable to MaskSource.
            drawable.mask = bare;

            // Reset to null so the runtime path does not try to compose the
            // (typing-illegal) bare node.
            drawable.mask = null;

            bare.destroy();
            drawable.destroy();
        });

        test('self-mask is rejected at runtime', () => {
            const drawable = new TestDrawable();

            expect(() => {
                drawable.mask = drawable;
            }).toThrow(/cannot use itself/i);

            drawable.destroy();
        });

        test('mask = null after a non-null mask removes any active mask', () => {
            const { runtime, composeCalls, drawCalls } = createRuntime();
            const drawable = new TestDrawable();
            const tex = createTexture();

            drawable.mask = tex;
            drawable.mask = null;

            drawable.render(runtime);

            expect(composeCalls).toEqual([]);
            expect(drawCalls).toHaveLength(1);

            drawable.destroy();
            tex.destroy();
        });
    });
});
