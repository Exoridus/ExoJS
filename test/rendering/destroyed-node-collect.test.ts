/**
 * Collect-time contract for a node that was `destroy()`ed but left attached to
 * the tree.
 *
 * Two halves:
 *
 *   1. Behaviour — the node contributes nothing to the render plan. A destroyed
 *      node has released its pooled transform/bounds, so collecting it reads
 *      freed state and re-pins it; "renders nothing" is the only correct result.
 *
 *   2. Production parity — the skip is never `__DEV__`-gated, so dev and
 *      production behave identically. Vitest always compiles `__DEV__` to
 *      `true`, which makes a dev-only skip indistinguishable from an
 *      unconditional one at runtime, so this half is verified structurally: the
 *      early return must not sit inside anything `__DEV__` can switch off.
 *      Gating it would leave production replaying a destroyed node's last
 *      visual state — a behavioural divergence, not a missing diagnostic.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';

import { Container } from '#rendering/Container';
import { Drawable } from '#rendering/Drawable';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/RenderCommand';
import { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
import { RenderPlanOptimizer } from '#rendering/plan/RenderPlanOptimizer';
import type { GroupScope } from '#rendering/plan/RenderScope';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { createRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import type { View } from '#rendering/View';

class LeafDrawable extends Drawable {
  public constructor(public readonly id: string) {
    super();
    this.getLocalBounds().set(0, 0, 16, 16);
  }
}

// File-local fake backend (repo convention keeps test harnesses file-local
// rather than importing them across test files).
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
    setView(v: View | null) {
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

const collectIds = (root: Container, backend: RenderBackend): string[] => {
  const builder = RenderPlanBuilder.acquire();
  const plan = builder.build(root, backend);

  RenderPlanOptimizer.optimize(plan);

  const draws: DrawCommand[] = [];
  for (const pass of plan.passes) {
    gatherScopeDraws(pass.root, draws);
  }

  RenderPlanBuilder.release(builder);

  return draws.map(d => (d.drawable as LeafDrawable).id);
};

describe('destroyed-but-attached node: collect behaviour', () => {
  test('a destroyed direct child is excluded from the collected draws', () => {
    const backend = createTestBackend();
    const root = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    root.addChild(leafA, leafB);

    expect(collectIds(root, backend)).toEqual(['a', 'b']);

    // The footgun: destroy WITHOUT removeChild, so the node stays linked in.
    leafA.destroy();

    expect(collectIds(root, backend)).toEqual(['b']);

    backend.destroy();
  });

  test('a destroyed child nested in a sub-container is excluded too', () => {
    const backend = createTestBackend();
    const root = new Container();
    const mid = new Container();
    const leafA = new LeafDrawable('a');
    const leafB = new LeafDrawable('b');

    mid.addChild(leafA);
    root.addChild(mid, leafB);

    expect(collectIds(root, backend).sort()).toEqual(['a', 'b']);

    leafA.destroy();

    expect(collectIds(root, backend)).toEqual(['b']);

    backend.destroy();
  });
});

// ---------------------------------------------------------------------------
// Production parity: the skip must survive `__DEV__ === false`.
// ---------------------------------------------------------------------------

const rootDir = resolve(import.meta.dirname!, '..', '..');

const devToken = /(?<![a-zA-Z0-9_$])__DEV__(?![a-zA-Z0-9_$])/;

const parseSource = (rel: string): ts.SourceFile =>
  ts.createSourceFile(rel, readFileSync(resolve(rootDir, rel), 'utf8'), ts.ScriptTarget.ES2022, true);

/**
 * Whether `node` sits inside anything `__DEV__` can switch off — an
 * `if (__DEV__)` branch, a `__DEV__ && …` short-circuit, or a `__DEV__ ? …`
 * conditional. A neighbouring `if (__DEV__) logger.warn(…)` statement is
 * correctly *not* a gate, which is why this walks the AST instead of nearby
 * source lines.
 */
const isDevGated = (node: ts.Node, source: ts.SourceFile): boolean => {
  for (let current: ts.Node = node; current.parent !== undefined; current = current.parent) {
    const parent = current.parent;

    if (
      ts.isIfStatement(parent) &&
      (parent.thenStatement === current || parent.elseStatement === current) &&
      devToken.test(parent.expression.getText(source))
    ) {
      return true;
    }

    if (
      ts.isConditionalExpression(parent) &&
      (parent.whenTrue === current || parent.whenFalse === current) &&
      devToken.test(parent.condition.getText(source))
    ) {
      return true;
    }

    if (ts.isBinaryExpression(parent) && parent.right === current && devToken.test(parent.left.getText(source))) {
      return true;
    }
  }

  return false;
};

/** The body of `RenderNode._collect`, located structurally rather than by line number. */
const findCollectBody = (source: ts.SourceFile): ts.Block => {
  let found: ts.Block | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === '_collect' && node.body !== undefined) {
      found = node.body;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  if (found === undefined) {
    throw new Error('Could not locate RenderNode._collect — update this structural check.');
  }

  return found;
};

/** Every `if` inside `_collect` whose condition tests `this.destroyed`. */
const destroyedGuards = (body: ts.Block, source: ts.SourceFile): ts.IfStatement[] => {
  const guards: ts.IfStatement[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && /(?<![a-zA-Z0-9_$])this\.destroyed(?![a-zA-Z0-9_$])/.test(node.expression.getText(source))) {
      guards.push(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(body);

  return guards;
};

describe('destroyed-but-attached node: production parity', () => {
  test('the destroyed-node skip in RenderNode._collect is not __DEV__-gated', () => {
    const rel = 'src/rendering/RenderNode.ts';
    const source = parseSource(rel);
    const guards = destroyedGuards(findCollectBody(source), source);

    expect(guards.length).toBeGreaterThan(0);

    for (const guard of guards) {
      // The condition itself must not carry `__DEV__ && …`, and the guard must
      // not be nested inside a dev-only branch. Either form would strip the
      // skip from production and leave a destroyed node rendering its last
      // visual state.
      expect(devToken.test(guard.expression.getText(source))).toBe(false);
      expect(isDevGated(guard, source)).toBe(false);
    }
  });
});
