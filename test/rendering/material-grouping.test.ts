import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RetainedDrawData } from '#rendering/plan/RetainedPlanCache';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes } from '#rendering/types';

class BoxDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }
}

/**
 * `ownMaterial` defaults to `true`: these fixtures hand-pick a pipeline/bind key
 * pair to stand for a distinct material, and only a draw carrying its own
 * material makes a bindKey difference cost a flush (see `forcesBatchFlush`).
 * Default-path behaviour is covered by the cases that pass `false` explicitly.
 */
const mkTypedMaterialKey = (pipelineKey: number, bindKey: number, ownMaterial = true): MaterialKey => ({
  rendererId: 1,
  blendMode: BlendModes.Normal,
  textureId: -1,
  shaderId: -1,
  pipelineKey,
  bindKey,
  ownMaterial,
});

/** A drawable whose material key is dictated by the test rather than derived. */
class KeyedDrawable extends Drawable {
  public constructor(
    private readonly pipelineKey: number,
    private readonly bindKey: number,
    private readonly ownMaterial = true,
  ) {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }

  public override _getOrComputeMaterialKey(): MaterialKey {
    return mkTypedMaterialKey(this.pipelineKey, this.bindKey, this.ownMaterial);
  }
}

/** Replays fixed retained slots instead of collecting children — the `_replayRetainedDraw` path. */
class ReplayOnlyContainer extends Container {
  public constructor(private readonly slots: readonly RetainedDrawData[]) {
    super();
  }

  protected override _collectContent(builder: RenderPlanBuilder): void {
    for (const slot of this.slots) {
      builder._replayRetainedDraw(slot);
    }
  }
}

const mkSlot = (drawable: Drawable, seq: number, pipelineKey: number, bindKey: number, ownMaterial = true): RetainedDrawData => ({
  drawable,
  seq,
  zIndex: 0,
  material: mkTypedMaterialKey(pipelineKey, bindKey, ownMaterial),
  minX: 0,
  minY: 0,
  maxX: 16,
  maxY: 16,
});

/**
 * A `Container` passed to `build` gets wrapped in its own group scope, so the
 * collected draws live one level below the plan root.
 */
const childGroupScope = (root: GroupScope): GroupScope => {
  const entry = root.entries[0];

  if (entry?.kind !== RenderEntryKind.Group) {
    throw new Error('expected the plan root to hold a single group entry');
  }

  return entry.scope;
};

const mkMaterialKey = (pipelineKey: number, bindKey: number, ownMaterial = true) => ({
  rendererId: 1,
  blendMode: 0 as const,
  textureId: -1,
  shaderId: -1,
  pipelineKey,
  bindKey,
  ownMaterial,
});

interface DrawEntryOpts {
  seq?: number;
  zIndex?: number;
  pipelineKey?: number;
  bindKey?: number;
  ownMaterial?: boolean;
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
      material: mkMaterialKey(opts.pipelineKey ?? 100, opts.bindKey ?? 100, opts.ownMaterial ?? true),
      minX: aabb.minX,
      minY: aabb.minY,
      maxX: aabb.maxX,
      maxY: aabb.maxY,
    },
  };
};

/**
 * Mirrors the `hasMixedPipeline` flag RenderPlanBuilder maintains incrementally
 * while collecting, so hand-built scopes behave like collected ones. The
 * optimizer skips material grouping outright when the flag is false, so a
 * fixture that forgot it would silently test nothing.
 */
const deriveHasMixedMaterial = (entries: readonly object[]): boolean => {
  let firstPipelineKey: number | null = null;
  let firstBindKey = 0;

  for (const entry of entries) {
    const candidate = entry as { kind: RenderEntryKind; command?: DrawCommand };

    if (candidate.kind !== RenderEntryKind.Draw || candidate.command === undefined) {
      continue;
    }

    const { pipelineKey, bindKey } = candidate.command.material;

    if (firstPipelineKey === null) {
      firstPipelineKey = pipelineKey;
      firstBindKey = bindKey;
    } else if (firstPipelineKey !== pipelineKey || firstBindKey !== bindKey) {
      return true;
    }
  }

  return false;
};

interface CreatePlanOpts {
  entries: object[];
  hasMixedZ?: boolean;
  hasMixedPipeline?: boolean;
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
    drawInstanced() {
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
          hasMixedPipeline: opts.hasMixedPipeline ?? deriveHasMixedMaterial(opts.entries),
          preserveDrawOrder: opts.preserveDrawOrder ?? false,
          transformNode: null,
          retainedInstructions: null,
          retainedRecordTarget: null,
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
            hasMixedPipeline: false,
            preserveDrawOrder: false,
            transformNode: null,
            retainedInstructions: null,
            retainedRecordTarget: null,
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

  test('single-material scope: skipping the material pass changes nothing', () => {
    // Three interleaved same-material draws. Whether the optimizer runs the
    // material pass or skips it on `hasMixedPipeline: false`, the resulting draw
    // order and groupIndex sequence must be identical — that equality is what
    // makes the skip safe.
    const mkEntries = () => {
      const a = new BoxDrawable('a');
      const b = new BoxDrawable('b');
      const c = new BoxDrawable('c');

      return [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(b, { pipelineKey: 100, bindKey: 100, aabb: { minX: 50, minY: 50, maxX: 66, maxY: 66 } }),
        createDrawEntry(c, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
      ];
    };

    const skipped = createPlan({ entries: mkEntries(), hasMixedPipeline: false });
    const forced = createPlan({ entries: mkEntries(), hasMixedPipeline: true });

    RenderPlanOptimizer.optimize(skipped);
    RenderPlanOptimizer.optimize(forced);

    const ids = (plan: ReturnType<typeof createPlan>) => plan.passes[0].root.entries.map((e: any) => ((e.command as DrawCommand).drawable as BoxDrawable).id);

    expect(ids(skipped)).toEqual(ids(forced));
    expect(getGroupIndices(skipped)).toEqual(getGroupIndices(forced));
    expect(getGroupIndices(skipped)).toEqual([2, 2, 2]);
  });

  test('hasMixedPipeline false suppresses the overlap-aware reorder a mixed scope would get', () => {
    // Same fixture as the reorder test above, but with the precheck flag forced
    // off: the reorder must not happen. Proves the flag is load-bearing rather
    // than decorative, so a builder that stops maintaining it fails loudly.
    const a = new BoxDrawable('a');
    const b = new BoxDrawable('b');
    const c = new BoxDrawable('c');

    const plan = createPlan({
      entries: [
        createDrawEntry(a, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
        createDrawEntry(b, { pipelineKey: 200, bindKey: 200, aabb: { minX: 50, minY: 50, maxX: 66, maxY: 66 } }),
        createDrawEntry(c, { pipelineKey: 100, bindKey: 100, aabb: { minX: 0, minY: 0, maxX: 16, maxY: 16 } }),
      ],
      hasMixedPipeline: false,
    });

    RenderPlanOptimizer.optimize(plan);

    const materials = getMaterials(plan);

    expect(materials.map((m: any) => m.pipelineKey)).toEqual([100, 200, 100]);
  });

  test('collected single-material scope leaves hasMixedPipeline false', () => {
    const { backend } = createRuntime();
    const container = new Container();

    container.addChild(new KeyedDrawable(100, 100));
    container.addChild(new KeyedDrawable(100, 100));

    const builder = RenderPlanBuilder.acquire();

    try {
      const scope = childGroupScope(builder.build(container, backend).passes[0]!.root);

      expect(scope.entries).toHaveLength(2);
      expect(scope.hasMixedPipeline).toBe(false);
    } finally {
      RenderPlanBuilder.release(builder);
    }
  });

  test('collected scope sets hasMixedPipeline on a differing pipelineKey or bindKey', () => {
    const { backend } = createRuntime();

    for (const second of [new KeyedDrawable(200, 100), new KeyedDrawable(100, 200)]) {
      const container = new Container();

      container.addChild(new KeyedDrawable(100, 100));
      container.addChild(second);

      const builder = RenderPlanBuilder.acquire();

      try {
        const scope = childGroupScope(builder.build(container, backend).passes[0]!.root);

        expect(scope.entries).toHaveLength(2);
        expect(scope.hasMixedPipeline).toBe(true);
      } finally {
        RenderPlanBuilder.release(builder);
      }
    }
  });

  test('the retained-replay path folds replayed materials into hasMixedPipeline', () => {
    const { backend } = createRuntime();
    const mixedA = new KeyedDrawable(100, 100);
    const mixedB = new KeyedDrawable(200, 200);
    const uniformA = new KeyedDrawable(100, 100);
    const uniformB = new KeyedDrawable(100, 100);

    const mixed = new ReplayOnlyContainer([mkSlot(mixedA, 0, 100, 100), mkSlot(mixedB, 1, 200, 200)]);
    const uniform = new ReplayOnlyContainer([mkSlot(uniformA, 0, 100, 100), mkSlot(uniformB, 1, 100, 100)]);

    const builder = RenderPlanBuilder.acquire();

    try {
      expect(childGroupScope(builder.build(mixed, backend).passes[0]!.root).hasMixedPipeline).toBe(true);
      expect(childGroupScope(builder.build(uniform, backend).passes[0]!.root).hasMixedPipeline).toBe(false);
    } finally {
      RenderPlanBuilder.release(builder);
    }
  });

  test('a recycled pooled scope does not carry hasMixedPipeline across frames', () => {
    const { backend } = createRuntime();
    const mixed = new Container();

    mixed.addChild(new KeyedDrawable(100, 100));
    mixed.addChild(new KeyedDrawable(200, 200));

    const uniform = new Container();

    uniform.addChild(new KeyedDrawable(100, 100));
    uniform.addChild(new KeyedDrawable(100, 100));

    const builder = RenderPlanBuilder.acquire();

    try {
      expect(childGroupScope(builder.build(mixed, backend).passes[0]!.root).hasMixedPipeline).toBe(true);
      expect(childGroupScope(builder.build(uniform, backend).passes[0]!.root).hasMixedPipeline).toBe(false);
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
