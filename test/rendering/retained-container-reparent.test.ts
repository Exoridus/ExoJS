import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RetainedGroupFragment } from '#rendering/plan/RetainedGroupFragment';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import { RetainedContainer } from '#rendering/RetainedContainer';

// Coverage for the "reparent across boundaries" hole called out in the expert
// review (2026-07-11, 01-rendering-core.md §4): the transform space-flip was
// only exercised via the barrier toggle, never via addChild/removeChild. These
// tests move nodes IN, OUT, and BETWEEN RetainedContainer boundaries and assert
// transforms, versions, and retained-state invalidation — including the F13/R3
// escaped-branch lifecycle (a deep-barrier branch reparented out/in/between).

class LeafDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

interface FragmentCarrier {
  _fragment: RetainedGroupFragment;
}

const fragmentOf = (group: RetainedContainer): RetainedGroupFragment => (group as unknown as FragmentCarrier)._fragment;

// File-local fake backend (repo convention keeps harnesses file-local).
const createTestBackend = (): RenderBackend => {
  const renderTarget = new RenderTarget(800, 600, true);

  return {
    backendType: RenderBackendType.WebGl2,
    stats: createRenderStats(),
    renderTarget,
    get view() {
      return renderTarget.view;
    },
    async initialize() {
      return this;
    },
    resetStats() {
      return this;
    },
    clear() {
      return this;
    },
    resize() {
      return this;
    },
    setView(v) {
      renderTarget.setView(v);
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
    acquireRenderTexture() {
      throw new Error('not used in this test');
    },
    releaseRenderTexture() {
      return this;
    },
    draw() {
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
  } as unknown as RenderBackend;
};

const gatherScopeDraws = (scope: GroupScope, out: DrawCommand[]): void => {
  for (const entry of scope.entries) {
    if (entry.kind === RenderEntryKind.Draw) {
      out.push(entry.command);
    } else if (entry.kind === RenderEntryKind.Group) {
      gatherScopeDraws(entry.scope, out);
    } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
      gatherScopeDraws(entry.scope.childPlan, out);
    }
  }
};

const collectDraws = (root: Container, backend: RenderBackend): DrawCommand[] => {
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);

  const draws: DrawCommand[] = [];
  for (const pass of plan.passes) {
    gatherScopeDraws(pass.root, draws);
  }

  RenderPlanBuilder.release(builder);

  return draws;
};

const idsOf = (draws: readonly DrawCommand[]): string[] => draws.map(d => (d.drawable as LeafDrawable).id);

describe('RetainedContainer reparenting: transform space flips across the boundary', () => {
  test('reparenting a node OUT of a group flips it from group-local to world space', () => {
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const child = new Drawable();

    group.setPosition(40, 0);
    outside.setPosition(1000, 0);
    child.setPosition(5, 0);

    world.addChild(group);
    world.addChild(outside);
    group.addChild(child);

    // Inside the group: group-local rendering space, composed world space.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(45);

    outside.addChild(child); // reparent OUT (addChild detaches from `group` first)

    expect(child.parent).toBe(outside);
    // No boundary above now: global === world, composed through `outside`.
    expect(child.getGlobalTransform().x).toBe(1005);
    expect(child.getWorldTransform().x).toBe(1005);
    expect(child.getWorldTransform()).toBe(child.getGlobalTransform());

    world.destroy();
  });

  test('reparenting a node INTO a group flips it from world space to group-local', () => {
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const child = new Drawable();

    group.setPosition(40, 0);
    outside.setPosition(100, 0);
    child.setPosition(5, 0);

    world.addChild(group);
    world.addChild(outside);
    outside.addChild(child);

    // Outside: plain world composition.
    expect(child.getGlobalTransform().x).toBe(105);
    expect(child.getWorldTransform().x).toBe(105);

    group.addChild(child); // reparent IN

    expect(child.parent).toBe(group);
    // Now group-local for rendering, composed through the boundary for world.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(45);

    world.destroy();
  });

  test('reparenting BETWEEN two groups rebases to the new group boundary', () => {
    const world = new Container();
    const groupA = new RetainedContainer();
    const groupB = new RetainedContainer();
    const child = new Drawable();

    groupA.setPosition(40, 0);
    groupB.setPosition(200, 0);
    child.setPosition(5, 0);

    world.addChild(groupA);
    world.addChild(groupB);
    groupA.addChild(child);

    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(45);

    groupB.addChild(child); // group A -> group B

    expect(child.parent).toBe(groupB);
    // Group-local is unchanged (5), but world rebases onto group B.
    expect(child.getGlobalTransform().x).toBe(5);
    expect(child.getWorldTransform().x).toBe(205);

    world.destroy();
  });

  test('reparenting bumps the structure revision on both old and new parent, leaving the group matrix version alone', () => {
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const child = new Drawable();

    world.addChild(group);
    world.addChild(outside);
    group.addChild(child);

    const groupStructureBefore = group._structureRevision;
    const outsideStructureBefore = outside._structureRevision;
    const groupMatrixBefore = group._groupMatrixVersion;

    outside.addChild(child); // reparent out

    // Removal structure-dirties the old parent; addition structure-dirties the new one.
    expect(group._structureRevision).toBeGreaterThan(groupStructureBefore);
    expect(outside._structureRevision).toBeGreaterThan(outsideStructureBefore);
    // Reparenting is a structural change, NOT an own-transform move of the group.
    expect(group._groupMatrixVersion).toBe(groupMatrixBefore);

    world.destroy();
  });
});

describe('RetainedContainer reparenting: retained fragment invalidation', () => {
  test('reparenting a child OUT invalidates the group fragment and drops the child from the group plan', () => {
    const backend = createTestBackend();
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    group.addChild(leafA);
    group.addChild(leafB);
    world.addChild(group);
    world.addChild(outside);

    collectDraws(world, backend); // frame 1: capture
    const frame2 = idsOf(collectDraws(world, backend)); // frame 2: clean splice

    expect(frame2).toEqual(['a', 'b']);
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(true);

    outside.addChild(leafB); // reparent OUT

    // The structural change dropped the fragment's clean state immediately.
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(false);

    const frame3 = idsOf(collectDraws(world, backend));

    // 'b' still renders (now under `outside`), but no longer inside the group's plan.
    expect(frame3).toContain('a');
    expect(frame3).toContain('b');
    // Fragment re-captured after the re-collect, and now holds only 'a'.
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(true);

    world.destroy();
    backend.destroy();
  });

  test('reparenting a child INTO a group captures it into the group fragment', () => {
    const backend = createTestBackend();
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    group.addChild(leafA);
    outside.addChild(leafB);
    world.addChild(group);
    world.addChild(outside);

    collectDraws(world, backend);
    collectDraws(world, backend); // settle the fragment

    group.addChild(leafB); // reparent IN

    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(false);

    const frame = idsOf(collectDraws(world, backend));

    expect(frame).toContain('a');
    expect(frame).toContain('b');
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(true);

    world.destroy();
    backend.destroy();
  });
});

describe('RetainedContainer reparenting: escaped deep-barrier branch (F13/R3)', () => {
  const makeDeepBarrierBranch = (): { branch: Container; deep: LeafDrawable } => {
    const branch = new Container();
    const deep = new LeafDrawable('deep');

    // Barrier one level BELOW the direct child => the whole branch escapes.
    deep.clip = true;
    deep.clipShape = new Rectangle(0, 0, 8, 8);
    branch.addChild(deep);

    return { branch, deep };
  };

  test('an escaped branch reports as escaped while inside the group, world-space for its subtree', () => {
    const group = new RetainedContainer();
    const { branch, deep } = makeDeepBarrierBranch();

    group.setPosition(40, 0);
    branch.setPosition(10, 0);

    group.addChild(branch);

    expect(group._childEscapesTransformGroup(branch)).toBe(true);
    // Escaped branch resolves world-space (group translation folded in).
    expect(branch.getGlobalTransform().x).toBe(50);
    expect(deep.getWorldTransform()).toBe(deep.getGlobalTransform());

    group.destroy();
  });

  test('reparenting an escaped branch OUT drops its group membership and rebases it under the new parent', () => {
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const { branch, deep } = makeDeepBarrierBranch();

    group.setPosition(40, 0);
    outside.setPosition(1000, 0);
    branch.setPosition(10, 0);
    deep.setPosition(1, 0);

    world.addChild(group);
    world.addChild(outside);
    group.addChild(branch);

    // Establish escape membership.
    expect(group._childEscapesTransformGroup(branch)).toBe(true);
    expect(deep.getGlobalTransform().x).toBe(51); // 40 + 10 + 1 (world-space escape)

    outside.addChild(branch); // reparent the escaped branch OUT

    // Group no longer tracks it; the branch is a plain child of `outside`.
    expect(group._childEscapesTransformGroup(branch)).toBe(false);
    expect(branch.parent).toBe(outside);
    expect(deep.getGlobalTransform().x).toBe(1011); // 1000 + 10 + 1
    expect(deep.getWorldTransform()).toBe(deep.getGlobalTransform());

    world.destroy();
  });

  test('reparenting a deep-barrier branch INTO a group makes it an escaped branch of the new group', () => {
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const { branch, deep } = makeDeepBarrierBranch();

    group.setPosition(40, 0);
    outside.setPosition(1000, 0);
    branch.setPosition(10, 0);
    deep.setPosition(1, 0);

    world.addChild(group);
    world.addChild(outside);
    outside.addChild(branch);

    // Outside a boundary it is not "escaped" (no boundary to escape); plain world.
    expect(deep.getGlobalTransform().x).toBe(1011);

    group.addChild(branch); // reparent IN

    expect(group._childEscapesTransformGroup(branch)).toBe(true);
    // Still world-space (it escapes), but now folded through the group's translation.
    expect(deep.getGlobalTransform().x).toBe(51);
    expect(deep.getWorldTransform()).toBe(deep.getGlobalTransform());

    world.destroy();
  });

  test('reparenting an escaped branch BETWEEN groups moves the membership', () => {
    const world = new Container();
    const groupA = new RetainedContainer();
    const groupB = new RetainedContainer();
    const { branch, deep } = makeDeepBarrierBranch();

    groupA.setPosition(40, 0);
    groupB.setPosition(200, 0);
    branch.setPosition(10, 0);
    deep.setPosition(1, 0);

    world.addChild(groupA);
    world.addChild(groupB);
    groupA.addChild(branch);

    expect(groupA._childEscapesTransformGroup(branch)).toBe(true);
    expect(deep.getGlobalTransform().x).toBe(51); // via group A

    groupB.addChild(branch); // A -> B

    expect(groupA._childEscapesTransformGroup(branch)).toBe(false);
    expect(groupB._childEscapesTransformGroup(branch)).toBe(true);
    expect(deep.getGlobalTransform().x).toBe(211); // 200 + 10 + 1 via group B

    world.destroy();
  });

  test('reparenting a deep-barrier branch IN invalidates the group fragment at the flip; it re-engages once the branch leaves', () => {
    const backend = createTestBackend();
    const world = new Container();
    const group = new RetainedContainer();
    const outside = new Container();
    const staticLeaf = new LeafDrawable('static');
    const { branch } = makeDeepBarrierBranch();

    group.addChild(staticLeaf);
    outside.addChild(branch);
    world.addChild(group);
    world.addChild(outside);

    collectDraws(world, backend);
    collectDraws(world, backend);
    // Steady state: a plain group with a static child holds a clean fragment.
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(true);

    group.addChild(branch); // reparent the escaped branch IN

    // The structural change dropped the fragment's clean state immediately.
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(false);

    const framesEscaped = idsOf(collectDraws(world, backend));

    expect(group._childEscapesTransformGroup(branch)).toBe(true);
    // Output stays correct across the flip: the static child and the escaped
    // deep-barrier leaf both render.
    expect(framesEscaped).toContain('static');
    expect(framesEscaped).toContain('deep');

    outside.addChild(branch); // reparent it back OUT: group fully re-engages

    expect(group._childEscapesTransformGroup(branch)).toBe(false);

    collectDraws(world, backend);
    collectDraws(world, backend);

    // With no escaped branch left, the group returns to a clean retained fragment.
    expect(fragmentOf(group).isClean(group._contentRevision, group._structureRevision, backend)).toBe(true);
    // Nothing was lost across the reparent: the static child stays in the group,
    // the deep-barrier leaf now renders under `outside`.
    const finalFrame = idsOf(collectDraws(world, backend));
    expect(finalFrame).toContain('static');
    expect(finalFrame).toContain('deep');

    world.destroy();
    backend.destroy();
  });
});
