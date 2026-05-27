import { Rectangle } from '@/math/Rectangle';
import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { Filter } from '@/rendering/filters/Filter';
import { type DrawCommand,RenderEntryKind } from '@/rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '@/rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '@/rendering/plan/RenderPlanOptimizer';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { Sprite } from '@/rendering/sprite/Sprite';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';

class BoxDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class CustomDrawable extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 20, 20);
  }
}

class NoopFilter extends Filter {
  public override apply(): void {
    // no-op
  }
}

class FailingFilter extends Filter {
  public override apply(): void {
    throw new Error('filter-failure');
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
  const stats = createRenderStats();
  const acquired: RenderTexture[] = [];
  const released: RenderTexture[] = [];
  const drawEvents: { drawable: Drawable; target: RenderTarget }[] = [];
  const clipEvents: string[] = [];
  const composeCalls: [RenderTexture, Texture | RenderTexture, number, number, number, number, number][] = [];

  const draw = vi.fn(function (this: RenderBackend, drawable: Drawable) {
    drawEvents.push({ drawable, target: currentTarget });

    return this;
  });

  const composeWithAlphaMask = vi.fn(function (
    this: RenderBackend,
    content: RenderTexture,
    mask: Texture | RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: number,
  ) {
    composeCalls.push([content, mask, x, y, width, height, blendMode]);

    return this;
  });

  const backend: RenderBackend = {
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
      clipEvents.push('push');

      return this;
    },
    popScissorRect() {
      clipEvents.push('pop');

      return this;
    },
    composeWithAlphaMask,
    acquireRenderTexture(width: number, height: number) {
      const texture = new RenderTexture(width, height);

      acquired.push(texture);

      return texture;
    },
    releaseRenderTexture(texture: RenderTexture) {
      released.push(texture);

      return this;
    },
    draw,
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

      for (const texture of acquired) {
        texture.destroy();
      }
    },
  };

  return {
    backend,
    root,
    draw,
    drawEvents,
    clipEvents,
    composeCalls,
    acquired,
    released,
  };
};

const filterDrawOrder = (drawEvents: { drawable: Drawable }[], expected: Drawable[]): Drawable[] => {
  const expectedSet = new Set(expected);

  return drawEvents.map(event => event.drawable).filter(drawable => expectedSet.has(drawable));
};

describe('render plan', () => {
  test('simple drawable renders exactly one draw command', () => {
    const { backend, draw } = createRuntime();
    const drawable = new BoxDrawable('a');

    drawable.render(backend);

    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith(drawable);
  });

  test('nested plain containers preserve children traversal order by default', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const left = new Container();
    const right = new Container();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    left.addChild(a, b);
    right.addChild(c);
    root.addChild(left, right);

    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c])).toEqual([a, b, c]);
  });

  test('applies local zIndex sorting among siblings', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    a.zIndex = 10;
    b.zIndex = 0;
    c.zIndex = 5;

    root.addChild(a, b, c);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c])).toEqual([b, c, a]);
  });

  test('nested child zIndex does not overtake nodes outside its local scope', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const nested = new Container();
    const nestedChild = new BoxDrawable('nested');
    const outside = new BoxDrawable('outside');

    nested.zIndex = 0;
    outside.zIndex = 1;
    nestedChild.zIndex = 999;

    nested.addChild(nestedChild);
    root.addChild(nested, outside);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [nestedChild, outside])).toEqual([nestedChild, outside]);
  });

  test('same zIndex uses current _children order as stable tie-breaker', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    a.zIndex = 7;
    b.zIndex = 7;
    c.zIndex = 7;

    root.addChild(a, b, c);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c])).toEqual([a, b, c]);
  });

  test('addChildAt, setChildIndex, and swapChildren update tie-break order', () => {
    const { backend, draw, drawEvents } = createRuntime();
    const root = new Container();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');
    const d = new BoxDrawable('d');

    root.addChild(a, b, c);
    root.addChildAt(d, 1);
    root.setChildIndex(c, 0);
    root.swapChildren(a, b);

    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c, d])).toEqual([c, b, d, a]);

    draw.mockClear();
    drawEvents.length = 0;
    root.swapChildren(c, a);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c, d])).toEqual([a, b, d, c]);
  });

  test('skips invisible nodes and increments culledNodes for out-of-view nodes', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const visible = new BoxDrawable('visible');
    const hidden = new BoxDrawable('hidden');
    const culled = new BoxDrawable('culled');

    hidden.visible = false;
    culled.setPosition(2000, 2000);

    root.addChild(visible, hidden, culled);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [visible, hidden, culled])).toEqual([visible]);
    expect(backend.stats.culledNodes).toBe(1);
  });

  test('rect masks keep push/pop balanced including nested stacks', () => {
    const { backend, clipEvents } = createRuntime();
    const outer = new Container();
    const inner = new Container();
    const leaf = new BoxDrawable('leaf');

    outer.mask = new Rectangle(0, 0, 100, 100);
    inner.mask = new Rectangle(10, 10, 40, 40);
    inner.addChild(leaf);
    outer.addChild(inner);

    outer.render(backend);

    expect(clipEvents).toEqual(['push', 'push', 'pop', 'pop']);
  });

  test('alpha mask compose keeps content/mask argument order', () => {
    const { backend, composeCalls } = createRuntime();
    const content = new BoxDrawable('content');
    const maskTexture = createTexture(8, 8);

    content.mask = maskTexture;
    content.render(backend);

    expect(composeCalls).toHaveLength(1);
    expect(composeCalls[0][0]).toBeInstanceOf(RenderTexture);
    expect(composeCalls[0][1]).toBe(maskTexture);

    maskTexture.destroy();
  });

  test('RenderNode mask source renders mask subtree into a render target', () => {
    const { backend, root, drawEvents, composeCalls } = createRuntime();
    const content = new BoxDrawable('content');
    const maskNode = new BoxDrawable('mask');

    content.mask = maskNode;
    content.render(backend);

    const maskDraw = drawEvents.find(event => event.drawable === maskNode);

    expect(maskDraw).toBeDefined();
    expect(maskDraw?.target).not.toBe(root);
    expect(composeCalls).toHaveLength(1);
  });

  test('filter chain releases render textures on success and failure', () => {
    const successRuntime = createRuntime();
    const successSprite = new Sprite(createTexture());

    successSprite.addFilter(new NoopFilter());
    successSprite.addFilter(new NoopFilter());
    successSprite.render(successRuntime.backend);

    expect(successRuntime.released).toHaveLength(successRuntime.acquired.length);

    const failureRuntime = createRuntime();
    const failureSprite = new Sprite(createTexture());

    failureSprite.addFilter(new FailingFilter());

    expect(() => failureSprite.render(failureRuntime.backend)).toThrow('filter-failure');
    expect(failureRuntime.released).toHaveLength(failureRuntime.acquired.length);
  });

  test('cacheAsBitmap cache hit skips subtree recollect and redraw', () => {
    const { backend, drawEvents } = createRuntime();
    const container = new Container();
    const child = new BoxDrawable('child');

    container.cacheAsBitmap = true;
    container.addChild(child);

    container.render(backend);

    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(container, backend);
      const entry = plan.passes[0].root.entries[0];

      expect(entry.kind).toBe(RenderEntryKind.Barrier);

      if (entry.kind === RenderEntryKind.Barrier) {
        expect(entry.scope.childPlan).toBeNull();
      }
    } finally {
      RenderPlanBuilder.release(builder);
    }

    container.render(backend);

    const childDraws = drawEvents.filter(event => event.drawable === child);

    expect(childDraws).toHaveLength(1);
  });

  test('nested barriers keep render texture acquire/release balanced', () => {
    const { backend, acquired, released } = createRuntime();
    const outer = new Container();
    const inner = new Container();
    const leaf = new BoxDrawable('leaf');

    outer.addFilter(new NoopFilter());
    inner.addFilter(new NoopFilter());
    inner.addChild(leaf);
    outer.addChild(inner);

    outer.render(backend);

    expect(released).toHaveLength(acquired.length);
  });

  test('custom Drawable still routes through backend.draw and registry-backed material key path', () => {
    const { backend, draw } = createRuntime();
    const custom = new CustomDrawable();
    const rendererToken = {};

    (backend as RenderBackend & { rendererRegistry: { resolve(drawable: Drawable): unknown } }).rendererRegistry = {
      resolve: vi.fn(() => rendererToken),
    };

    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(custom, backend);
      const entry = plan.passes[0].root.entries[0];

      expect(entry.kind).toBe(RenderEntryKind.Draw);

      if (entry.kind === RenderEntryKind.Draw) {
        expect(entry.command.material.rendererId).toBeGreaterThan(0);
      }
    } finally {
      RenderPlanBuilder.release(builder);
    }

    custom.render(backend);

    expect(draw).toHaveBeenCalledWith(custom);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  test('builder pool is re-entrant and nested render() acquires distinct builders', () => {
    const { backend } = createRuntime();
    const root = new Container();
    const child = new BoxDrawable('child');
    const acquiredBuilders: RenderPlanBuilder[] = [];
    const originalAcquire = RenderPlanBuilder.acquire;

    root.cacheAsBitmap = true;
    root.addChild(child);

    const acquireSpy = vi.spyOn(RenderPlanBuilder, 'acquire').mockImplementation(() => {
      const builder = originalAcquire.call(RenderPlanBuilder);

      acquiredBuilders.push(builder);

      return builder;
    });

    root.render(backend);

    acquireSpy.mockRestore();

    expect(acquiredBuilders.length).toBeGreaterThan(1);
    expect(new Set(acquiredBuilders).size).toBeGreaterThan(1);
  });

  test('optimizer does not reorder scopes when hasMixedZ is false', () => {
    const { backend } = createRuntime();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const firstEntry = {
      kind: RenderEntryKind.Draw as const,
      seq: 1,
      zIndex: 0,
      command: {
        kind: RenderEntryKind.Draw,
        drawable: a,
        nodeIndex: 0,
        seq: 1,
        zIndex: 0,
        material: { rendererId: 1, blendMode: a.blendMode, textureId: -1, shaderId: -1, pipelineKey: 1, bindKey: 1 },
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
      },
    };
    const secondEntry = {
      kind: RenderEntryKind.Draw as const,
      seq: 0,
      zIndex: 0,
      command: {
        kind: RenderEntryKind.Draw,
        drawable: b,
        nodeIndex: 1,
        seq: 0,
        zIndex: 0,
        material: { rendererId: 2, blendMode: b.blendMode, textureId: -1, shaderId: -1, pipelineKey: 2, bindKey: 2 },
        minX: 0,
        minY: 0,
        maxX: 1,
        maxY: 1,
      },
    };

    const plan = {
      passes: [
        {
          target: null,
          view: backend.view,
          clearColor: null,
          root: {
            kind: RenderEntryKind.Group,
            entries: [firstEntry, secondEntry],
            hasMixedZ: false,
          },
        },
      ],
      nodeCount: 2,
      reset() {
        this.passes.length = 0;
        this.nodeCount = 0;
      },
    };

    RenderPlanOptimizer.optimize(plan);

    expect(plan.passes[0].root.entries[0]).toBe(firstEntry);
    expect(plan.passes[0].root.entries[1]).toBe(secondEntry);
  });

  test('optimizer sorting is stable and does not mutate Container._children order', () => {
    const { backend, drawEvents } = createRuntime();
    const root = new Container();
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    a.zIndex = 2;
    b.zIndex = 1;
    c.zIndex = 2;

    root.addChild(a, b, c);
    root.render(backend);

    expect(filterDrawOrder(drawEvents, [a, b, c])).toEqual([b, a, c]);
    expect(root.children).toEqual([a, b, c]);
  });

  test('nodeIndex remains stable for each draw command after optimize', () => {
    const { backend } = createRuntime();
    const root = new Container();
    const first = new BoxDrawable('first');
    const second = new BoxDrawable('second');

    // Force a re-order during optimize.
    first.zIndex = 10;
    second.zIndex = 0;
    root.addChild(first, second);

    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(root, backend);
      const collectNodeIndices = (entries: readonly any[], target: Map<Drawable, number>): void => {
        for (const entry of entries) {
          if (entry.kind === RenderEntryKind.Draw) {
            target.set(entry.command.drawable, entry.command.nodeIndex);
            continue;
          }

          if (entry.kind === RenderEntryKind.Group) {
            collectNodeIndices(entry.scope.entries, target);
          }
        }
      };
      const before = new Map<Drawable, number>();
      collectNodeIndices(plan.passes[0].root.entries, before);

      RenderPlanOptimizer.optimize(plan);

      const after = new Map<Drawable, number>();
      collectNodeIndices(plan.passes[0].root.entries, after);

      expect(after.get(first)).toBe(before.get(first));
      expect(after.get(second)).toBe(before.get(second));
      expect(after.get(first)).not.toBe(after.get(second));
    } finally {
      RenderPlanBuilder.release(builder);
    }
  });

  test('adjacent same-material draws coalesce into same groupIndex', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const mkMat = (pk: number, bk: number) => ({
      rendererId: 1, blendMode: 0, textureId: -1, shaderId: -1, pipelineKey: pk, bindKey: bk,
    });

    const createDraw = (d: Drawable, opts: { pk?: number; bk?: number } = {}) => ({
      kind: RenderEntryKind.Draw as const,
      seq: 0,
      zIndex: 0,
      command: {
        kind: RenderEntryKind.Draw as const,
        drawable: d,
        nodeIndex: 0,
        seq: 0,
        zIndex: 0,
        material: mkMat(opts.pk ?? 100, opts.bk ?? 100),
        minX: 0, minY: 0, maxX: 16, maxY: 16,
      },
    });

    const { backend } = createRuntime();
    const plan = {
      passes: [{
        target: null as any, view: backend.view, clearColor: null as any,
        root: {
          kind: RenderEntryKind.Group as const,
          entries: [
            createDraw(a, { pk: 100, bk: 100 }),
            createDraw(b, { pk: 100, bk: 100 }),
          ],
          hasMixedZ: false,
          preserveDrawOrder: false,
        },
      }],
      nodeCount: 0,
      reset() { this.passes.length = 0; this.nodeCount = 0; },
    };

    RenderPlanOptimizer.optimize(plan);

    const root = plan.passes[0].root;
    const g0 = (root.entries[0] as any).command as DrawCommand;
    const g1 = (root.entries[1] as any).command as DrawCommand;

    expect(g0.groupIndex).toBeGreaterThan(0);
    expect(g0.groupIndex).toBe(g1.groupIndex);
  });
});
