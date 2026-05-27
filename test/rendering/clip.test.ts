import { type Matrix } from '@/math/Matrix';
import { Rectangle } from '@/math/Rectangle';
import { Container } from '@/rendering/Container';
import { Geometry } from '@/rendering/geometry/Geometry';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { Sprite } from '@/rendering/sprite/Sprite';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';

interface StencilCall {
  readonly shape: Geometry;
  readonly transform: Matrix;
}

const createTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

const createTriangle = (): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, 32, 0, 16, 32]),
    stride: 8,
  });

const createRuntime = () => {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();
  const events: string[] = [];
  const scissorRects: Rectangle[] = [];
  const stencilCalls: StencilCall[] = [];

  const runtime: RenderBackend = {
    backendType: RenderBackendType.WebGl2,
    stats,
    get renderTarget() {
      return currentTarget;
    },
    get view() {
      return this.renderTarget.view;
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
    pushScissorRect(bounds) {
      events.push('scissor:push');
      scissorRects.push(bounds);

      return this;
    },
    popScissorRect() {
      events.push('scissor:pop');

      return this;
    },
    pushStencilClip(shape, transform) {
      events.push('stencil:push');
      stencilCalls.push({ shape, transform });

      return this;
    },
    popStencilClip() {
      events.push('stencil:pop');

      return this;
    },
    composeWithAlphaMask() {
      events.push('compose');

      return this;
    },
    acquireRenderTexture(width: number, height: number) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture() {
      return this;
    },
    draw(drawable) {
      events.push('draw');

      return this;
    },
    resetStats() {
      resetRenderStats(stats);

      return this;
    },
    execute(pass) {
      pass.execute(this);

      return this;
    },
    flush() {
      return this;
    },
    destroy() {
      root.destroy();
    },
  };

  return { runtime, events, scissorRects, stencilCalls, root };
};

describe('geometric clipping (node.clip / clipShape)', () => {
  test('clip with a null clipShape uses the scissor fast path, not stencil', () => {
    const { runtime, events, scissorRects } = createRuntime();
    const texture = createTexture(40, 30);
    const sprite = new Sprite(texture);

    sprite.setPosition(20, 30);
    sprite.clip = true;

    sprite.render(runtime);

    expect(events).toEqual(['scissor:push', 'draw', 'scissor:pop']);
    // The scissor rectangle is the node's world-space bounds.
    expect(scissorRects[0].equals(sprite.getBounds())).toBe(true);

    texture.destroy();
  });

  test('clip with a Rectangle clipShape uses scissor, not stencil', () => {
    const { runtime, events, scissorRects, stencilCalls } = createRuntime();
    const texture = createTexture();
    const sprite = new Sprite(texture);
    const rect = new Rectangle(4, 8, 24, 16);

    sprite.clip = true;
    sprite.clipShape = rect;

    sprite.render(runtime);

    expect(events).toEqual(['scissor:push', 'draw', 'scissor:pop']);
    expect(scissorRects[0]).toBe(rect);
    expect(stencilCalls).toHaveLength(0);

    texture.destroy();
  });

  test('clip with a Geometry clipShape uses the stencil path, not scissor', () => {
    const { runtime, events, stencilCalls } = createRuntime();
    const texture = createTexture();
    const sprite = new Sprite(texture);
    const triangle = createTriangle();

    sprite.clip = true;
    sprite.clipShape = triangle;

    sprite.render(runtime);

    expect(events).toEqual(['stencil:push', 'draw', 'stencil:pop']);
    expect(stencilCalls).toHaveLength(1);
    expect(stencilCalls[0].shape).toBe(triangle);
    expect(stencilCalls[0].transform).toBe(sprite.getGlobalTransform());

    texture.destroy();
    triangle.destroy();
  });

  test('clip = false performs no clip operations', () => {
    const { runtime, events } = createRuntime();
    const texture = createTexture();
    const sprite = new Sprite(texture);

    sprite.render(runtime);

    expect(events).toEqual(['draw']);

    texture.destroy();
  });

  test('stencil clip wraps the alpha-mask block as the outermost boundary', () => {
    const { runtime, events, stencilCalls } = createRuntime();
    const texture = createTexture();
    const sprite = new Sprite(texture);
    const triangle = createTriangle();

    sprite.clip = true;
    sprite.clipShape = triangle;
    sprite.mask = new Rectangle(2, 2, 10, 10);

    sprite.render(runtime);

    // Stencil (clip) outside, the mask's scissor inside, draw innermost.
    expect(events).toEqual(['stencil:push', 'scissor:push', 'draw', 'scissor:pop', 'stencil:pop']);
    expect(stencilCalls).toHaveLength(1);

    texture.destroy();
    triangle.destroy();
  });

  test('nested stencil clips produce balanced push/pop nesting', () => {
    const { runtime, events } = createRuntime();
    const texture = createTexture();
    const container = new Container();
    const child = new Sprite(texture);

    container.clip = true;
    container.clipShape = createTriangle();
    child.clip = true;
    child.clipShape = createTriangle();
    container.addChild(child);

    container.render(runtime);

    expect(events).toEqual(['stencil:push', 'stencil:push', 'draw', 'stencil:pop', 'stencil:pop']);

    texture.destroy();
    (container.clipShape as Geometry).destroy();
    (child.clipShape as Geometry).destroy();
  });

  test('a Rectangle mask still maps to scissor and is unchanged by clip', () => {
    const { runtime, events, scissorRects } = createRuntime();
    const texture = createTexture();
    const sprite = new Sprite(texture);
    const maskRect = new Rectangle(1, 1, 5, 5);

    sprite.mask = maskRect;

    sprite.render(runtime);

    expect(events).toEqual(['scissor:push', 'draw', 'scissor:pop']);
    expect(scissorRects[0]).toBe(maskRect);

    texture.destroy();
  });

  test('clip becomes a barrier effect so a clipped container is a render boundary', () => {
    const texture = createTexture();
    const clipped = new Container();
    const plain = new Container();

    expect(plain._renderPlanHasBarrierEffects()).toBe(false);

    clipped.clip = true;

    expect(clipped._renderPlanHasBarrierEffects()).toBe(true);

    texture.destroy();
  });
});
