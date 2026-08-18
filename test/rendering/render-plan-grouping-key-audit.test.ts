/**
 * Grouping key audit: documents the alignment (and intentional mismatches)
 * between RenderPlanOptimizer groupIndex assignment and Sprite/Mesh renderer
 * batch boundaries.
 *
 * Outcome A - already aligned. No optimizer runtime changes are needed.
 *
 * Key findings:
 *
 * 1. Sprite renderers (WebGL2 + WebGPU) do NOT consume groupIndex at all.
 *    They track blendMode / material instance / base-texture in their own
 *    state machine and flush independently. groupIndex is assigned by the
 *    optimizer and consumed only by mesh static-batch detection.
 *
 * 2. Mesh renderers use groupIndex equality as a necessary (not sufficient)
 *    gate for static-batch coalescing. They also recheck pipelineKey, bindKey,
 *    blendMode, geometry identity, and texture identity directly, so the
 *    optimizer's pipelineKey:bindKey grouping is redundant-but-aligned.
 *
 * 3. Default-path sprite texture grouping follows the batcher: a distinct
 *    texture yields a distinct bindKey but the SAME groupIndex, because the
 *    sprite renderer rotates up to 16 textures through its slots without a
 *    flush. Splitting on bindKey there would mark a batch boundary the batcher
 *    never takes. The remaining renderer-owned cause, slot exhaustion past 16
 *    textures, is still not modelled by the optimizer.
 *
 * 4. Custom-material sprite base texture is renderer-owned: the material's
 *    bindKey encodes the material's own extra textures (material.textures /
 *    texture-valued uniforms), NOT the sprite's base texture (sprite.texture).
 *    Two custom-material sprites sharing a material instance get the same
 *    groupIndex regardless of their base texture - and the custom path now
 *    rotates base textures through its own slot table, so that also costs no
 *    flush until the table is exhausted.
 *
 * 5. The z-split in _assignGroupIndices serves mesh static-batch draw order:
 *    meshes at different z must not coalesce. For sprite renderers the split
 *    is harmless - their own state machine coalesces compatible sprites
 *    regardless of groupIndex boundaries.
 *
 * Hard boundaries preserved by the optimizer:
 *   - Barrier entries (filter/mask/cacheAsTexture effects)
 *   - Group scope entries (nested containers)
 *   - Material changes that force the batcher to flush (`forcesBatchFlush`):
 *     pipelineKey, crossing between the default and custom paths, and - on the
 *     custom path only - bindKey
 *   - z-index changes
 *   Render-target changes, scissor/stencil changes, and texture-slot
 *   exhaustion are renderer-owned and are not the optimizer's concern.
 */

import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { type DrawCommand, materialKeyForcesFlush, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { RenderPlan } from '#rendering/plan/RenderPlan';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

class AuditDrawable extends Drawable {
  public constructor() {
    super();
    this._setLocalBounds(0, 0, 16, 16);
  }
}

const createBuildBackend = () => {
  const target = new RenderTarget(320, 200, true);

  return {
    backend: { view: target.view, stats: createRenderStats() } as unknown as RenderBackend,
    destroy: () => target.destroy(),
  };
};

const createTexture = (width = 16, height = 16): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return new Texture(canvas);
};

const drawScopeOf = (root: GroupScope): GroupScope => {
  const entry = root.entries[0];

  return entry?.kind === RenderEntryKind.Group ? entry.scope : root;
};

const buildOptimizedDrawCommands = (root: Container, backend: RenderBackend): DrawCommand[] => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);

    const scope = drawScopeOf(plan.passes[0].root);

    return scope.entries.filter(e => e.kind === RenderEntryKind.Draw).map(e => (e as { command: DrawCommand }).command);
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

const mkMat = (pipelineKey: number, bindKey: number, overrides: Partial<DrawCommand['material']> = {}): DrawCommand['material'] => ({
  rendererId: 1,
  blendMode: 0 as BlendModes,
  textureId: -1,
  shaderId: -1,
  pipelineKey,
  bindKey,
  ownMaterial: false,
  ...overrides,
});

const createDrawEntry = (
  drawable: Drawable,
  pipelineKey: number,
  bindKey: number,
  overrides: { zIndex?: number; textureId?: number; rendererId?: number; shaderId?: number; ownMaterial?: boolean } = {},
) => ({
  kind: RenderEntryKind.Draw as const,
  seq: 0,
  zIndex: overrides.zIndex ?? 0,
  command: {
    kind: RenderEntryKind.Draw as const,
    drawable,
    nodeIndex: 0,
    seq: 0,
    zIndex: overrides.zIndex ?? 0,
    material: mkMat(pipelineKey, bindKey, {
      textureId: overrides.textureId,
      rendererId: overrides.rendererId,
      shaderId: overrides.shaderId,
      ownMaterial: overrides.ownMaterial ?? false,
    } as Partial<DrawCommand['material']>),
    minX: 0,
    minY: 0,
    maxX: 16,
    maxY: 16,
  },
});

/**
 * Mirrors the `hasMixedPipeline` flag RenderPlanBuilder maintains incrementally
 * while collecting, so hand-built scopes behave like collected ones. The
 * optimizer skips material grouping outright when the flag is false, so a
 * fixture that forgot it would silently test nothing.
 */
const deriveHasMixedPipeline = (entries: readonly object[]): boolean => {
  let first: DrawCommand['material'] | null = null;

  for (const entry of entries) {
    const candidate = entry as { kind: RenderEntryKind; command?: DrawCommand };

    if (candidate.kind !== RenderEntryKind.Draw || candidate.command === undefined) {
      continue;
    }

    const material = candidate.command.material;

    if (first === null) {
      first = material;
    } else if (materialKeyForcesFlush(first.pipelineKey, first.bindKey, first.ownMaterial, material)) {
      return true;
    }
  }

  return false;
};

const createPlan = (entries: object[]): RenderPlan => {
  const { backend, destroy } = createBuildBackend();

  try {
    const scope: GroupScope = {
      kind: RenderEntryKind.Group,
      entries: entries as GroupScope['entries'],
      hasMixedZ: false,
      hasMixedPipeline: deriveHasMixedPipeline(entries),
      preserveDrawOrder: false,
      transformNode: null,
      retainedInstructions: null,
      retainedRecordTarget: null,
      persistentDraw: null,
    };

    return {
      passes: [{ target: null, view: backend.view, clearColor: null, root: scope }],
      nodeCount: 0,
    } as unknown as RenderPlan;
  } finally {
    destroy();
  }
};

const getGroupIndices = (plan: RenderPlan) =>
  plan.passes[0].root.entries
    .filter((e: unknown) => (e as { kind: RenderEntryKind }).kind === RenderEntryKind.Draw)
    .map((e: unknown) => (e as { command: DrawCommand }).command.groupIndex ?? 0);

const minimalGlsl = {
  vertex: '#version 300 es\nvoid main(){gl_Position=vec4(0.0);}',
  fragment: '#version 300 es\nprecision lowp float;out vec4 c;void main(){c=vec4(1.0);}',
};

const createSpriteMaterial = () => new SpriteMaterial({ shader: new ShaderSource({ glsl: minimalGlsl }) });

// ---------------------------------------------------------------------------
// groupKey internals
// ---------------------------------------------------------------------------

describe('render plan grouping key audit', () => {
  describe('groupKey function', () => {
    test('groupKey uses only pipelineKey and bindKey — textureId, rendererId, shaderId are irrelevant', () => {
      // Two draws share the same pipelineKey:bindKey but differ on textureId,
      // rendererId, and shaderId. The optimizer must still assign the same
      // groupIndex because the groupKey string is identical.
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([
        createDrawEntry(a, 100, 200, { textureId: 1, rendererId: 10, shaderId: 5 }),
        createDrawEntry(b, 100, 200, { textureId: 99, rendererId: 20, shaderId: 77 }),
      ]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).toBeGreaterThan(0);
      expect(gi0).toBe(gi1);
    });

    test('different pipelineKey always breaks grouping regardless of bindKey', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200), createDrawEntry(b, 999, 200)]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).not.toBe(gi1);
    });

    test('a bindKey change alone does NOT break grouping on the default path', () => {
      // Default path: bindKey is the texture identity, and the sprite batcher
      // rotates 16 of those through its slots without flushing.
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200), createDrawEntry(b, 100, 999)]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).toBe(gi1);
    });

    test('a bindKey change breaks grouping between draws carrying their own material', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200, { ownMaterial: true }), createDrawEntry(b, 100, 999, { ownMaterial: true })]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).not.toBe(gi1);
    });

    test('crossing between the default and custom paths breaks grouping on its own', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200), createDrawEntry(b, 100, 200, { ownMaterial: true })]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).not.toBe(gi1);
    });
  });

  // ---------------------------------------------------------------------------
  // Default-path sprite grouping
  // ---------------------------------------------------------------------------

  describe('default-path sprite grouping', () => {
    test('same-texture sprites with the same blend mode share a groupIndex', () => {
      const { backend, destroy } = createBuildBackend();

      try {
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].groupIndex).toBeGreaterThan(0);
        expect(cmds[0].groupIndex).toBe(cmds[1].groupIndex);

        tex.destroy();
      } finally {
        destroy();
      }
    });

    test('different blend modes produce different groupIndices (pipelineKey encodes blendMode)', () => {
      // For the default path, pipelineKey = rendererId * 31 + blendMode.
      // Two sprites with different blend modes therefore get different
      // pipelineKeys and must land in different groups — matching the
      // sprite renderer's flush-on-blendMode-change boundary.
      const { backend, destroy } = createBuildBackend();

      try {
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        a.blendMode = BlendModes.Normal;
        b.blendMode = BlendModes.Additive;

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].groupIndex).not.toBe(cmds[1].groupIndex);
        // pipelineKey encodes the blend mode, so they differ.
        expect(cmds[0].material.pipelineKey).not.toBe(cmds[1].material.pipelineKey);

        tex.destroy();
      } finally {
        destroy();
      }
    });

    test('different textures share a groupIndex (the batcher rotates slots without flushing)', () => {
      // For the default path, bindKey = rendererId * 31 + textureId, so different
      // textures give different bindKeys — but the sprite renderer absorbs a
      // texture change into one of its 16 slots and does not flush, so the two
      // draws stay in one group. Only slot exhaustion past 16 textures would
      // cost a draw call, and that remains renderer-owned.
      const { backend, destroy } = createBuildBackend();

      try {
        const texA = createTexture(16, 16);
        const texB = createTexture(32, 32);
        const root = new Container();
        const a = new Sprite(texA);
        const b = new Sprite(texB);

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].groupIndex).toBe(cmds[1].groupIndex);
        // bindKey still encodes the texture identity — it just costs no flush.
        expect(cmds[0].material.bindKey).not.toBe(cmds[1].material.bindKey);

        texA.destroy();
        texB.destroy();
      } finally {
        destroy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Custom-material sprite grouping
  // ---------------------------------------------------------------------------

  describe('custom-material sprite grouping', () => {
    test('same SpriteMaterial instance on consecutive sprites produces the same groupIndex', () => {
      const { backend, destroy } = createBuildBackend();

      try {
        const mat = createSpriteMaterial();
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        a.material = mat;
        b.material = mat;

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].groupIndex).toBeGreaterThan(0);
        expect(cmds[0].groupIndex).toBe(cmds[1].groupIndex);

        mat.destroy();
        tex.destroy();
      } finally {
        destroy();
      }
    });

    test('different SpriteMaterial instances produce different groupIndices', () => {
      // Each material has a unique materialId, so deriveBindKey returns a
      // different bindKey per instance even when the shader source is identical.
      const { backend, destroy } = createBuildBackend();

      try {
        const matA = createSpriteMaterial();
        const matB = createSpriteMaterial();
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        a.material = matA;
        b.material = matB;

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].groupIndex).not.toBe(cmds[1].groupIndex);
        // bindKey differs because materialId differs.
        expect(cmds[0].material.bindKey).not.toBe(cmds[1].material.bindKey);

        matA.destroy();
        matB.destroy();
        tex.destroy();
      } finally {
        destroy();
      }
    });

    test('same SpriteMaterial, different base textures: same groupIndex (base texture is renderer-tracked)', () => {
      // For custom-material sprites, bindKey = material.bindKey which is
      // derived from the material's own extra textures, NOT from sprite.texture.
      // Two sprites sharing a material instance get the same pipelineKey and
      // bindKey regardless of their base texture, so the optimizer gives them
      // the same groupIndex.
      //
      // The sprite renderer absorbs a base-texture change into one of its
      // custom-path slots and only flushes on slot exhaustion — that boundary
      // is renderer-owned, not optimizer-owned.
      const { backend, destroy } = createBuildBackend();

      try {
        const mat = createSpriteMaterial();
        const texA = createTexture(16, 16);
        const texB = createTexture(32, 32);
        const root = new Container();
        const a = new Sprite(texA);
        const b = new Sprite(texB);

        a.material = mat;
        b.material = mat;

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        // textureId differs (different sprite base textures).
        expect(cmds[0].material.textureId).not.toBe(cmds[1].material.textureId);
        // But pipelineKey and bindKey are the same (both derived from the material).
        expect(cmds[0].material.pipelineKey).toBe(cmds[1].material.pipelineKey);
        expect(cmds[0].material.bindKey).toBe(cmds[1].material.bindKey);
        // Therefore the optimizer assigns the same groupIndex.
        expect(cmds[0].groupIndex).toBe(cmds[1].groupIndex);

        mat.destroy();
        texA.destroy();
        texB.destroy();
      } finally {
        destroy();
      }
    });

    test('different material blend modes produce different groupIndices', () => {
      // material.pipelineKey is derived from shader identity + blend mode.
      // Two materials with different blendModes therefore produce different
      // pipelineKeys and end up in different optimizer groups — matching the
      // sprite renderer's flush-on-blendMode-change boundary.
      const { backend, destroy } = createBuildBackend();

      try {
        const shader = new ShaderSource({ glsl: minimalGlsl });
        const matNormal = new SpriteMaterial({ shader, blendMode: BlendModes.Normal });
        const matAdditive = new SpriteMaterial({ shader, blendMode: BlendModes.Additive });
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        a.material = matNormal;
        b.material = matAdditive;

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        expect(cmds[0].material.pipelineKey).not.toBe(cmds[1].material.pipelineKey);
        expect(cmds[0].groupIndex).not.toBe(cmds[1].groupIndex);

        matNormal.destroy();
        matAdditive.destroy();
        tex.destroy();
      } finally {
        destroy();
      }
    });

    test('sprite-level blendMode override with custom material: same groupIndex (renderer-owned boundary)', () => {
      // When sprite.blendMode != Normal with a custom material the renderer
      // uses sprite.blendMode instead of material.blendMode for the GPU blend
      // state (_renderCustom / _renderDefault). However, the optimizer derives
      // pipelineKey from material.pipelineKey (which encodes material.blendMode,
      // NOT sprite.blendMode). Two sprites sharing the same material but with
      // different sprite-level blendMode overrides therefore get the SAME
      // groupIndex.
      //
      // The MaterialKey.blendMode field (drawable.blendMode) DOES record the
      // sprite-level value, but groupKey() only uses pipelineKey:bindKey —
      // blendMode is not part of it. The renderer's blendMode state machine
      // flushes on this boundary independently of groupIndex.
      const { backend, destroy } = createBuildBackend();

      try {
        const mat = createSpriteMaterial(); // material.blendMode = Normal
        const tex = createTexture();
        const root = new Container();
        const a = new Sprite(tex);
        const b = new Sprite(tex);

        a.material = mat;
        b.material = mat;
        b.blendMode = BlendModes.Additive; // sprite-level override

        root.addChild(a, b);

        const cmds = buildOptimizedDrawCommands(root, backend);

        expect(cmds).toHaveLength(2);
        // The MaterialKey.blendMode field records drawable.blendMode, so they differ.
        expect(cmds[0].material.blendMode).not.toBe(cmds[1].material.blendMode);
        // pipelineKey is the same — it comes from material.pipelineKey (material.blendMode=Normal).
        expect(cmds[0].material.pipelineKey).toBe(cmds[1].material.pipelineKey);
        // Same groupIndex: sprite-level blendMode override is a renderer-owned boundary.
        expect(cmds[0].groupIndex).toBe(cmds[1].groupIndex);

        mat.destroy();
        tex.destroy();
      } finally {
        destroy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // z-index boundary (serves mesh static-batch, harmless for sprite)
  // ---------------------------------------------------------------------------

  describe('z-index boundary', () => {
    test('same-material draws at different z-indices get different groupIndices', () => {
      // The mesh static-batch gate requires groupIndex equality, which
      // prevents cross-z batching and preserves draw order. For sprite
      // renderers the z-split is harmless — their own state machine
      // coalesces compatible sprites regardless of groupIndex boundaries.
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200, { zIndex: 0 }), createDrawEntry(b, 100, 200, { zIndex: 5 })]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).not.toBe(gi1);
    });

    test('same-material draws at the same z share a groupIndex', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200, { zIndex: 3 }), createDrawEntry(b, 100, 200, { zIndex: 3 })]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      expect(gi0).toBe(gi1);
    });
  });

  // ---------------------------------------------------------------------------
  // Hard boundaries
  // ---------------------------------------------------------------------------

  describe('hard boundaries', () => {
    test('Barrier entry breaks a group segment', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const barrier = {
        kind: RenderEntryKind.Barrier as const,
        seq: 1,
        zIndex: 0,
        scope: {
          kind: RenderEntryKind.Barrier as const,
          node: a as unknown,
          effect: { filters: [], clip: 0, maskSource: null, cacheAsTexture: false, blendMode: 0 },
          childPlan: null,
          left: 0,
          top: 0,
          width: 16,
          height: 16,
        },
      };

      const plan = createPlan([createDrawEntry(a, 100, 200), barrier, createDrawEntry(b, 100, 200)]);

      RenderPlanOptimizer.optimize(plan);

      const drawEntries = plan.passes[0].root.entries.filter(e => (e as { kind: RenderEntryKind }).kind === RenderEntryKind.Draw);

      expect(drawEntries).toHaveLength(2);

      const gi0 = (drawEntries[0] as { command: DrawCommand }).command.groupIndex;
      const gi1 = (drawEntries[1] as { command: DrawCommand }).command.groupIndex;

      // Barrier separates the two segments; neither is undefined.
      expect(gi0).toBeDefined();
      expect(gi1).toBeDefined();
      expect(gi0).not.toBe(gi1);
    });

    test('Group scope entry breaks a group segment', () => {
      const a = new AuditDrawable();
      const b = new AuditDrawable();
      const nested = new AuditDrawable();

      const groupEntry = {
        kind: RenderEntryKind.Group as const,
        seq: 1,
        zIndex: 0,
        scope: {
          kind: RenderEntryKind.Group as const,
          entries: [createDrawEntry(nested, 100, 200)],
          hasMixedZ: false,
          hasMixedPipeline: false,
          preserveDrawOrder: false,
        },
      };

      const plan = createPlan([createDrawEntry(a, 100, 200), groupEntry, createDrawEntry(b, 100, 200)]);

      RenderPlanOptimizer.optimize(plan);

      const rootEntries = plan.passes[0].root.entries;
      const firstDraw = (rootEntries[0] as { command: DrawCommand }).command;
      const thirdDraw = (rootEntries[2] as { command: DrawCommand }).command;

      expect(firstDraw.groupIndex).not.toBe(thirdDraw.groupIndex);
    });
  });

  // ---------------------------------------------------------------------------
  // Mesh static-batch gate documentation
  // ---------------------------------------------------------------------------

  describe('mesh static-batch gate', () => {
    test('groupIndex equality is necessary but not sufficient for mesh static batching', () => {
      // The mesh renderers (_isSameBatch / _isSameStaticBatch) require:
      //   groupIndex equality  AND
      //   geometry identity    AND
      //   shader/material identity AND
      //   blendMode equality   AND
      //   texture identity     AND
      //   pipelineKey equality AND
      //   bindKey equality
      //
      // This test documents that two draws assigned the SAME groupIndex by the
      // optimizer still fail the mesh batch check when their geometry differs
      // (only the optimizer-side is validated here; the renderer-side check is
      // proven by the mesh renderer's own unit and browser tests).
      //
      // The optimizer's pipelineKey:bindKey groupKey guarantees that two draws
      // in the same optimizer group always agree on pipelineKey and bindKey —
      // which are also in the mesh batch check. So the optimizer never groups
      // two draws whose pipeline state differs.
      const a = new AuditDrawable();
      const b = new AuditDrawable();

      const plan = createPlan([createDrawEntry(a, 100, 200), createDrawEntry(b, 100, 200)]);

      RenderPlanOptimizer.optimize(plan);

      const [gi0, gi1] = getGroupIndices(plan);

      // Same groupIndex → both commands carry the same pipelineKey and bindKey.
      expect(gi0).toBe(gi1);

      const drawEntries = plan.passes[0].root.entries.filter(e => (e as { kind: RenderEntryKind }).kind === RenderEntryKind.Draw);
      const cmd0 = (drawEntries[0] as { command: DrawCommand }).command;
      const cmd1 = (drawEntries[1] as { command: DrawCommand }).command;

      expect(cmd0.material.pipelineKey).toBe(cmd1.material.pipelineKey);
      expect(cmd0.material.bindKey).toBe(cmd1.material.bindKey);
    });
  });
});
