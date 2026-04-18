import { Color } from 'core/Color';
import { CallbackRenderPass } from 'rendering/CallbackRenderPass';
import { Container } from 'rendering/Container';
import { Drawable } from 'rendering/Drawable';
import { RenderBackendType } from 'rendering/RenderBackendType';
import { RenderTargetPass } from 'rendering/RenderTargetPass';
import { RenderTarget } from 'rendering/RenderTarget';
import type { SceneRenderRuntime } from 'rendering/SceneRenderRuntime';
import { Sprite } from 'rendering/sprite/Sprite';
import { RenderTexture } from 'rendering/texture/RenderTexture';
import { Texture } from 'rendering/texture/Texture';
import { View } from 'rendering/View';
import { Filter } from 'rendering/filters/Filter';
import { BlurFilter } from 'rendering/filters/BlurFilter';
import { ColorFilter } from 'rendering/filters/ColorFilter';

class TestDrawable extends Drawable {}

class RecordingFilter extends Filter {

    private readonly _id: string;
    private readonly _events: Array<string>;
    public readonly calls = jest.fn();

    public constructor(id: string, events: Array<string>) {
        super();

        this._id = id;
        this._events = events;
    }

    public apply(_runtime: SceneRenderRuntime, _input: RenderTexture, _output: RenderTexture): void {
        this._events.push(this._id);
        this.calls();
    }
}

const createTexture = (width = 16, height = 16): Texture => {
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    return new Texture(canvas);
};

const createRuntime = () => {
    const root = new RenderTarget(320, 200, true);
    let currentTarget: RenderTarget = root;
    const released: Array<RenderTexture> = [];
    const maskEvents: Array<string> = [];
    const draw = jest.fn(function(this: SceneRenderRuntime) {
        return this;
    });
    const clear = jest.fn(function(this: SceneRenderRuntime) {
        return this;
    });
    const runtime: SceneRenderRuntime = {
        backendType: RenderBackendType.WebGl2,
        get renderTarget() {
            return currentTarget;
        },
        get view() {
            return this.renderTarget.view;
        },
        async initialize() {
            return this;
        },
        clear,
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
        pushMask() {
            maskEvents.push('push');

            return this;
        },
        popMask() {
            maskEvents.push('pop');

            return this;
        },
        acquireRenderTexture(width: number, height: number) {
            return new RenderTexture(width, height);
        },
        releaseRenderTexture(texture: RenderTexture) {
            released.push(texture);

            return this;
        },
        draw,
        execute(pass) {
            pass.execute(this);

            return this;
        },
        flush() {
            return this;
        },
        destroy() {
            root.destroy();

            for (const texture of released) {
                texture.destroy();
            }
        },
    };

    return {
        runtime,
        draw,
        clear,
        released,
        maskEvents,
        root,
    };
};

describe('render effects', () => {
    test('applies a single filter', () => {
        const { runtime } = createRuntime();
        const events: Array<string> = [];
        const texture = createTexture();
        const drawable = new Sprite(texture);
        const filter = new RecordingFilter('one', events);

        drawable.addFilter(filter);
        drawable.render(runtime);

        expect(events).toEqual(['one']);
        expect(filter.calls).toHaveBeenCalledTimes(1);

        texture.destroy();
    });

    test('built-in ColorFilter runs a composition pass', () => {
        const { runtime, draw } = createRuntime();
        const input = new RenderTexture(16, 16);
        const output = new RenderTexture(16, 16);
        const filter = new ColorFilter(new Color(255, 64, 64, 0.5));

        filter.apply(runtime, input, output);

        expect(draw).toHaveBeenCalledTimes(1);

        filter.destroy();
        input.destroy();
        output.destroy();
    });

    test('built-in BlurFilter performs multi-sample composition', () => {
        const { runtime, draw } = createRuntime();
        const input = new RenderTexture(16, 16);
        const output = new RenderTexture(16, 16);
        const filter = new BlurFilter({ radius: 2, quality: 1 });

        filter.apply(runtime, input, output);

        expect(draw.mock.calls.length).toBeGreaterThan(1);

        filter.destroy();
        input.destroy();
        output.destroy();
    });

    test('applies chained filters in declaration order', () => {
        const { runtime } = createRuntime();
        const events: Array<string> = [];
        const texture = createTexture();
        const drawable = new Sprite(texture);
        const first = new RecordingFilter('first', events);
        const second = new RecordingFilter('second', events);

        drawable.addFilter(first).addFilter(second);
        drawable.render(runtime);

        expect(events).toEqual(['first', 'second']);

        texture.destroy();
    });

    test('propagates filter failures and still releases temporary render textures', () => {
        const { runtime, released } = createRuntime();
        const texture = createTexture();
        const drawable = new Sprite(texture);
        const failingFilter = new class extends Filter {
            public override apply(): void {
                throw new Error('filter setup failed');
            }
        };

        drawable.addFilter(failingFilter);

        expect(() => drawable.render(runtime)).toThrow('filter setup failed');
        expect(released.length).toBeGreaterThan(0);

        texture.destroy();
    });

    test('adding and removing filters does not corrupt render flow', () => {
        const { runtime, draw } = createRuntime();
        const texture = createTexture();
        const drawable = new Sprite(texture);
        const filter = new RecordingFilter('filter', []);

        drawable.addFilter(filter);
        drawable.render(runtime);
        drawable.removeFilter(filter);
        drawable.render(runtime);

        expect(filter.calls).toHaveBeenCalledTimes(1);
        expect(draw).toHaveBeenCalledTimes(3);

        texture.destroy();
    });

    test('routes mask push/pop around masked renders', () => {
        const { runtime, maskEvents } = createRuntime();
        const texture = createTexture();
        const drawable = new TestDrawable();
        const mask = new Sprite(texture);

        mask.x = 5;
        mask.y = 8;
        drawable.mask = mask;
        drawable.render(runtime);

        expect(maskEvents).toEqual(['push', 'pop']);

        mask.destroy();
        texture.destroy();
    });

    test('nested masks produce balanced push/pop ordering', () => {
        const { runtime, maskEvents } = createRuntime();
        const texture = createTexture();
        const container = new Container();
        const child = new TestDrawable();
        const containerMask = new Sprite(texture);
        const childMask = new Sprite(texture);

        container.mask = containerMask;
        child.mask = childMask;
        container.addChild(child);
        container.render(runtime);

        expect(maskEvents).toEqual(['push', 'push', 'pop', 'pop']);

        containerMask.destroy();
        childMask.destroy();
        texture.destroy();
    });

    test('RenderTargetPass restores render target and view after execution', () => {
        const { runtime, root, clear } = createRuntime();
        const target = new RenderTexture(64, 64);
        const view = new View(32, 32, 64, 64);
        let executedOnTarget = false;
        let executedWithView = false;
        const pass = new RenderTargetPass(() => {
            executedOnTarget = runtime.renderTarget === target;
            executedWithView = runtime.view === view;
        }, {
            target,
            view,
            clearColor: Color.transparentBlack,
        });

        runtime.execute(pass);

        expect(executedOnTarget).toBe(true);
        expect(executedWithView).toBe(true);
        expect(runtime.renderTarget).toBe(root);
        expect(runtime.view).toBe(root.view);
        expect(clear).toHaveBeenCalledTimes(1);

        view.destroy();
        target.destroy();
    });

    test('supports simple multi-pass render-target composition', () => {
        const { runtime, root } = createRuntime();
        const firstTarget = new RenderTexture(64, 64);
        const secondTarget = new RenderTexture(64, 64);
        const sequence: Array<string> = [];

        runtime.execute(new RenderTargetPass(() => {
            sequence.push(runtime.renderTarget === firstTarget ? 'first' : 'wrong');
        }, {
            target: firstTarget,
            view: firstTarget.view,
            clearColor: Color.transparentBlack,
        }));
        runtime.execute(new RenderTargetPass(() => {
            sequence.push(runtime.renderTarget === secondTarget ? 'second' : 'wrong');
        }, {
            target: secondTarget,
            view: secondTarget.view,
            clearColor: Color.transparentBlack,
        }));

        expect(sequence).toEqual(['first', 'second']);
        expect(runtime.renderTarget).toBe(root);

        firstTarget.destroy();
        secondTarget.destroy();
    });

    test('CallbackRenderPass executes supplied callback', () => {
        const { runtime } = createRuntime();
        const callback = jest.fn();

        runtime.execute(new CallbackRenderPass(callback));

        expect(callback).toHaveBeenCalledWith(runtime);
    });

    test('cache-as-bitmap bypasses subtree redraw until invalidated', () => {
        const { runtime } = createRuntime();
        const container = new Container();
        const texture = createTexture();
        const child = new Sprite(texture);
        const childRender = jest.spyOn(child, 'render');

        container.addChild(child);
        container.cacheAsBitmap = true;

        container.render(runtime);
        container.render(runtime);

        expect(childRender).toHaveBeenCalledTimes(1);

        container.invalidateCache();
        container.render(runtime);

        expect(childRender).toHaveBeenCalledTimes(2);

        texture.destroy();
    });
});
