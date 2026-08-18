// Type contract for `Container`'s child list. Compiled by
// `tsconfig.type-tests.json` via `pnpm typecheck:type-tests`, NOT collected by
// vitest (no `.test.ts` suffix).
//
// `Container` keeps three caches derived from its child list — the frozen
// `children` snapshot, the paint-order view and the child-index map — and
// invalidates them from its own mutation methods. A subclass reaching into the
// array directly would leave all three silently stale, and no runtime check can
// catch that without freezing the array on every structural change. The type is
// the guarantee instead, so this file exists to keep it honest.

import { Container, type RenderNode, Sprite } from '@codexo/exojs';

class ProbeContainer extends Container {
  public readAccessStillWorks(): number {
    // Subclasses must keep cheap indexed reads — RetainedContainer walks this
    // on the collect path every frame.
    let total = 0;
    const count: number = this._children.length;
    const first: RenderNode | undefined = this._children[0];

    if (first?.visible === true) {
      total++;
    }

    return total + count;
  }

  public mutationIsRejected(): void {
    const sprite = new Sprite(null);

    // @ts-expect-error — push() is not available on a readonly array; go through addChild().
    this._children.push(sprite);

    // @ts-expect-error — splice() likewise; go through removeChild()/setChildIndex().
    this._children.splice(0, 1);

    // @ts-expect-error — index assignment likewise.
    this._children[0] = sprite;

    // @ts-expect-error — the list itself is not replaceable either.
    this._children = [];
  }
}

// The public snapshot stays readonly for callers as well.
const container = new Container();
const snapshot: readonly RenderNode[] = container.children;

// @ts-expect-error — the public snapshot rejects mutation too.
snapshot.push(new Sprite(null));

export { ProbeContainer };
