import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { collectRenderGroups, type RenderInstruction } from '#rendering/plan/RenderInstruction';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';

class BoxDrawable extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

class OtherDrawable extends Drawable {
  public constructor() {
    super();
    this.getLocalBounds().set(0, 0, 20, 20);
  }
}

const createBuildBackend = () => {
  const target = new RenderTarget(320, 200, true);

  return {
    backend: { view: target.view, stats: createRenderStats() } as unknown as RenderBackend,
    destroy: () => target.destroy(),
  };
};

// A Container root is collected as a single wrapping Group entry; its
// children (the draws under test) live in that nested group scope.
const drawScopeOf = (root: GroupScope): GroupScope => {
  const entry = root.entries[0];

  return entry?.kind === RenderEntryKind.Group ? entry.scope : root;
};

const buildOptimizedScope = (root: Container, backend: RenderBackend): GroupScope => {
  const builder = RenderPlanBuilder.acquire();

  try {
    const plan = builder.build(root, backend);

    RenderPlanOptimizer.optimize(plan);

    return drawScopeOf(plan.passes[0].root);
  } finally {
    RenderPlanBuilder.release(builder);
  }
};

describe('render instructions', () => {
  test('RenderInstruction is the DrawCommand leaf unit', () => {
    expectTypeOf<RenderInstruction>().toEqualTypeOf<DrawCommand>();
  });

  test('same-material sprites at different z-indices land in separate render groups', () => {
    // The optimizer assigns different groupIndices when z differs, so the plan
    // has two logical groups. However, the sprite renderer coalesces these into
    // one GPU draw call because it tracks blend-mode/texture/material — not
    // groupIndex. This test documents the logical split; draw-call coalescing
    // is proven by the browser tests.
    const { backend, destroy } = createBuildBackend();

    try {
      const root = new Container();
      const a = new BoxDrawable();
      const b = new BoxDrawable();

      a.zIndex = 0;
      b.zIndex = 5;
      root.addChild(a, b);

      const scope = buildOptimizedScope(root, backend);
      const groups = collectRenderGroups(scope);

      // Same type → same material key; but different z → two logical groups.
      expect(groups).toHaveLength(2);
      expect(groups[0].groupIndex).not.toBe(groups[1].groupIndex);
      // Both groups carry the same pipeline/bind state.
      expect(groups[0].material.pipelineKey).toBe(groups[1].material.pipelineKey);
      expect(groups[0].material.bindKey).toBe(groups[1].material.bindKey);
    } finally {
      destroy();
    }
  });

  test('consecutive same-material draws coalesce into one render group', () => {
    const { backend, destroy } = createBuildBackend();

    try {
      const root = new Container();
      const a = new BoxDrawable();
      const b = new BoxDrawable();
      const c = new BoxDrawable();

      root.addChild(a, b, c);

      const groups = collectRenderGroups(buildOptimizedScope(root, backend));

      expect(groups).toHaveLength(1);
      expect(groups[0].instructions.map(instruction => instruction.drawable)).toEqual([a, b, c]);
      expect(groups[0].material).toBe(groups[0].instructions[0].material);
    } finally {
      destroy();
    }
  });

  test('a material boundary splits draws into separate render groups', () => {
    const { backend, destroy } = createBuildBackend();

    try {
      const root = new Container();
      const a = new BoxDrawable();
      const b = new BoxDrawable();
      const other = new OtherDrawable();

      root.addChild(a, b, other);

      const groups = collectRenderGroups(buildOptimizedScope(root, backend));

      expect(groups).toHaveLength(2);
      expect(groups[0].instructions).toHaveLength(2);
      expect(groups[1].instructions.map(instruction => instruction.drawable)).toEqual([other]);
      expect(groups[0].groupIndex).not.toBe(groups[1].groupIndex);
    } finally {
      destroy();
    }
  });

  test('a nested group entry breaks a render group run', () => {
    const { backend, destroy } = createBuildBackend();

    try {
      const root = new Container();
      const before = new BoxDrawable();
      const nested = new Container();
      const after = new BoxDrawable();

      // Nested container with content emits a Group entry between the two
      // same-material draws, so they must not coalesce across it.
      nested.addChild(new BoxDrawable());
      root.addChild(before, nested, after);

      const scope = buildOptimizedScope(root, backend);
      const groups = collectRenderGroups(scope);

      expect(groups).toHaveLength(2);
      expect(groups[0].instructions.map(instruction => instruction.drawable)).toEqual([before]);
      expect(groups[1].instructions.map(instruction => instruction.drawable)).toEqual([after]);
      // The nested group is not flattened into the parent's render groups.
      expect(scope.entries.some(entry => entry.kind === RenderEntryKind.Group)).toBe(true);
    } finally {
      destroy();
    }
  });

  test('unoptimized draws form singleton groups without coalescing', () => {
    const { backend, destroy } = createBuildBackend();

    try {
      const root = new Container();
      const a = new BoxDrawable();
      const b = new BoxDrawable();

      root.addChild(a, b);

      const builder = RenderPlanBuilder.acquire();

      try {
        // No optimize() call: groupIndex is still undefined on every command.
        const scope = drawScopeOf(builder.build(root, backend).passes[0].root);
        const groups = collectRenderGroups(scope);

        expect(groups).toHaveLength(2);
        expect(groups.every(group => group.instructions.length === 1)).toBe(true);
      } finally {
        RenderPlanBuilder.release(builder);
      }
    } finally {
      destroy();
    }
  });
});
