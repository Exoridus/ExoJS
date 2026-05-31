import { Container } from '@/rendering/Container';
import { Drawable } from '@/rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '@/rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '@/rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '@/rendering/plan/RenderPlanOptimizer';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '@/rendering/RenderStats';
import { RenderTarget } from '@/rendering/RenderTarget';
import { RenderTexture } from '@/rendering/texture/RenderTexture';

class BoxDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

const mkMaterialKey = (pipelineKey: number, bindKey: number) => ({
  rendererId: 1,
  blendMode: 0 as const,
  textureId: -1,
  shaderId: -1,
  pipelineKey,
  bindKey,
});

interface DrawEntryOpts {
  seq?: number;
  zIndex?: number;
  pipelineKey?: number;
  bindKey?: number;
  aabb?: { minX: number; minY: number; maxX: number; maxY: number };
}

const createDrawEntry = (drawable: Drawable, opts: DrawEntryOpts = {}) => {
  const aabb = opts.aabb ?? { minX: 0, minY: 0, maxX: 16, maxY: 16 };

  return {
    kind: RenderEntryKind.Draw as const,
    seq: opts.seq ?? 0,
    zIndex: opts.zIndex ?? 0,
    command: {
      kind: RenderEntryKind.Draw as const,
      drawable,
      nodeIndex: 0,
      seq: opts.seq ?? 0,
      zIndex: opts.zIndex ?? 0,
      material: mkMaterialKey(opts.pipelineKey ?? 100, opts.bindKey ?? 100),
      minX: aabb.minX,
      minY: aabb.minY,
      maxX: aabb.maxX,
      maxY: aabb.maxY,
    },
  };
};

interface CreatePlanOpts {
  entries: object[];
  hasMixedZ?: boolean;
  preserveDrawOrder?: boolean;
}

const createRuntime = () => {
  const root = new RenderTarget(320, 200, true);
  let currentTarget: RenderTarget = root;
  const stats = createRenderStats();

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
    resize() {
      return this;
    },
    setView() {
      return this;
    },
    setRenderTarget(target) {
      currentTarget = target ?? root;
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
    acquireRenderTexture(width, height) {
      return new RenderTexture(width, height);
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
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

  return { backend };
};

const createPlan = (opts: CreatePlanOpts) => {
  const { backend } = createRuntime();

  return {
    passes: [
      {
        target: null as any,
        view: backend.view,
        clearColor: null as any,
        root: {
          kind: RenderEntryKind.Group as const,
          entries: opts.entries as [],
          hasMixedZ: opts.hasMixedZ ?? false,
          preserveDrawOrder: opts.preserveDrawOrder ?? false,
        },
      },
    ],
    nodeCount: 0,
    reset() {
      this.passes.length = 0;
      this.nodeCount = 0;
    },
  };
};

const getMaterials = (plan: ReturnType<typeof createPlan>) =>
  plan.passes[0].root.entries.filter((e: any) => e.kind === RenderEntryKind.Draw).map((e: any) => (e.command as DrawCommand).material);

const getGroupIndices = (plan: ReturnType<typeof createPlan>) =>
  plan.passes[0].root.entries.filter((e: any) => e.kind === RenderEntryKind.Draw).map((e: any) => (e.command as DrawCommand).groupIndex ?? 0);

describe('material grouping', () => {
  test('different material draws do not coalesce', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }), createDrawEntry(b, { pipelineKey: 200, bindKey: 200 })],
    });

    RenderPlanOptimizer.optimize(plan);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices).toHaveLength(2);
    expect(groupIndices[0]).not.toBe(groupIndices[1]);
  });

  test('different bind key breaks grouping even with same pipeline key', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }), createDrawEntry(b, { pipelineKey: 100, bindKey: 200 })],
    });

    RenderPlanOptimizer.optimize(plan);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices).toHaveLength(2);
    expect(groupIndices[0]).not.toBe(groupIndices[1]);
  });

  test('different pipeline key breaks grouping even with same bind key', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }), createDrawEntry(b, { pipelineKey: 200, bindKey: 100 })],
    });

    RenderPlanOptimizer.optimize(plan);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices).toHaveLength(2);
    expect(groupIndices[0]).not.toBe(groupIndices[1]);
  });

  test('Group scope intervening entry segments draw grouping', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }),
        {
          kind: RenderEntryKind.Group as const,
          seq: 1,
          zIndex: 0,
          scope: {
            kind: RenderEntryKind.Group as const,
            entries: [createDrawEntry(b, { pipelineKey: 100, bindKey: 100 })],
            hasMixedZ: false,
            preserveDrawOrder: false,
          },
        },
        createDrawEntry(b, { pipelineKey: 100, bindKey: 100 }),
      ],
    });

    RenderPlanOptimizer.optimize(plan);

    const rootEntries = plan.passes[0].root.entries;
    const firstDraw = (rootEntries[0] as any).command as DrawCommand;
    const thirdDraw = (rootEntries[2] as any).command as DrawCommand;

    expect(firstDraw.groupIndex).not.toBe(thirdDraw.groupIndex);
  });

  test('Barrier intervening entry segments draw grouping', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }),
        {
          kind: RenderEntryKind.Barrier as const,
          seq: 1,
          zIndex: 0,
          scope: {
            kind: RenderEntryKind.Barrier as const,
            node: a as any,
            effect: { filters: [], clip: 0, maskSource: null, cacheAsBitmap: false, blendMode: 0 },
            childPlan: null,
            left: 0,
            top: 0,
            width: 16,
            height: 16,
          },
        },
        createDrawEntry(b, { pipelineKey: 100, bindKey: 100 }),
      ],
    });

    RenderPlanOptimizer.optimize(plan);

    const rootEntries = plan.passes[0].root.entries;
    const firstDraw = (rootEntries[0] as any).command as DrawCommand;
    const thirdDraw = (rootEntries[2] as any).command as DrawCommand;

    expect(firstDraw.groupIndex).toBeDefined();
    expect(thirdDraw.groupIndex).toBeDefined();
  });

  test('zIndex boundaries prevent grouping across z-levels', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [createDrawEntry(a, { pipelineKey: 100, bindKey: 100, zIndex: 0 }), createDrawEntry(b, { pipelineKey: 100, bindKey: 100, zIndex: 10 })],
    });

    RenderPlanOptimizer.optimize(plan);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices).toHaveLength(2);
    expect(groupIndices[0]).not.toBe(groupIndices[1]);
  });

  test('overlap-aware reorder groups same-key draws when AABBs do not overlap with intervening draw', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(b, { pipelineKey: 200, bindKey: 200, aabb: { minX: 50, minY: 50, maxX: 66, maxY: 66 } }),
        createDrawEntry(c, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
      ],
    });

    RenderPlanOptimizer.optimize(plan);

    const materials = getMaterials(plan);

    expect(materials).toHaveLength(3);
    expect(materials[0].pipelineKey).toBe(100);
    expect(materials[1].pipelineKey).toBe(100);
    expect(materials[2].pipelineKey).toBe(200);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices[0]).toBe(groupIndices[1]);
    expect(groupIndices[1]).not.toBe(groupIndices[2]);
  });

  test('overlapping incompatible draw prevents overlap-aware reorder', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(b, { pipelineKey: 200, bindKey: 200, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(c, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
      ],
    });

    RenderPlanOptimizer.optimize(plan);

    const materials = getMaterials(plan);

    expect(materials).toHaveLength(3);
    expect(materials[0].pipelineKey).toBe(100);
    expect(materials[1].pipelineKey).toBe(200);
    expect(materials[2].pipelineKey).toBe(100);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices[0]).not.toBe(groupIndices[2]);
  });

  test('preserveDrawOrder disables overlap-aware reorder', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(b, { pipelineKey: 200, bindKey: 200, aabb: { minX: 50, minY: 50, maxX: 66, maxY: 66 } }),
        createDrawEntry(c, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
      ],
      preserveDrawOrder: true,
    });

    RenderPlanOptimizer.optimize(plan);

    const materials = getMaterials(plan);

    expect(materials).toHaveLength(3);
    expect(materials[0].pipelineKey).toBe(100);
    expect(materials[1].pipelineKey).toBe(200);
    expect(materials[2].pipelineKey).toBe(100);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices[0]).not.toBe(groupIndices[1]);
    expect(groupIndices[1]).not.toBe(groupIndices[2]);
  });

  test('adjacency coalescing still applies with preserveDrawOrder when same-key draws are consecutive', () => {
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');

    const plan = createPlan({
      entries: [createDrawEntry(a, { pipelineKey: 100, bindKey: 100 }), createDrawEntry(b, { pipelineKey: 100, bindKey: 100 })],
      preserveDrawOrder: true,
    });

    RenderPlanOptimizer.optimize(plan);

    const groupIndices = getGroupIndices(plan);

    expect(groupIndices).toHaveLength(2);
    expect(groupIndices[0]).toBe(groupIndices[1]);
  });

  test('Container.preserveDrawOrder propagates to GroupScope in build plan', () => {
    const { backend } = createRuntime();
    const container = new Container();

    container.preserveDrawOrder = true;

    const child = new BoxDrawable('child');

    container.addChild(child);

    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(container, backend);
      const rootScope = plan.passes[0].root;

      const groupEntry = rootScope.entries[0];

      expect(groupEntry.kind).toBe(RenderEntryKind.Group);

      if (groupEntry.kind === RenderEntryKind.Group) {
        expect(groupEntry.scope.preserveDrawOrder).toBe(true);
      }
    } finally {
      RenderPlanBuilder.release(builder);
    }
  });

  test('default Container.preserveDrawOrder is false', () => {
    const { backend } = createRuntime();
    const container = new Container();
    const child = new BoxDrawable('child');

    container.addChild(child);

    const builder = RenderPlanBuilder.acquire();

    try {
      const plan = builder.build(container, backend);
      const rootScope = plan.passes[0].root;

      expect(rootScope.preserveDrawOrder).toBe(false);
    } finally {
      RenderPlanBuilder.release(builder);
    }
  });
});
