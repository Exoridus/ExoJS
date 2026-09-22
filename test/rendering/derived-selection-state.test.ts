/**
 * Stable derived slots and the draw-order stream over them.
 *
 * The two properties this file exists to pin are the ones a wrong
 * implementation still renders plausibly for: that a STAY item keeps the slot it
 * had (so the backend's persistent stores stay valid without being rewritten),
 * and that the order stream reproduces the emit order EXACTLY - including nested
 * scopes at their recorded position - because that stream IS the draw order.
 */
import { describe, expect, it } from 'vitest';

import type { Drawable } from '#rendering/Drawable';
import { DerivedSelectionState } from '#rendering/plan/DerivedSelectionState';
import { RenderEntryKind } from '#rendering/plan/renderCommand';
import { createSourceScope, finalizeSourceScopes, type SourceGroup, type SourceScope } from '#rendering/plan/renderSourceItem';
import { MembershipBits } from '#rendering/plan/SourceVisibilityIndex';

const drawable = (): Drawable => ({}) as Drawable;

/** Append `count` items to `scope`; bounds are irrelevant here, membership is set by hand. */
const fill = (scope: SourceScope, count: number): void => {
  for (let i = 0; i < count; i++) {
    scope.items.push(drawable(), i, 0, 0, 0, 1, 1);
  }
};

/** A nested group scope holding `count` items, spliced into `parent` after `itemMark` items. */
const nest = (parent: SourceScope, count: number, itemMark: number): SourceGroup => {
  const group = createSourceScope() as SourceGroup;

  Object.assign(group, { kind: RenderEntryKind.Group, seq: 0, zIndex: 0, preserveDrawOrder: false, node: null, itemMark });
  fill(group, count);
  parent.others.push(group);

  return group;
};

/** Finalize `root` and return the scope list in ordinal order. */
const finalize = (root: SourceScope): SourceScope[] => {
  const scopes: SourceScope[] = [];

  finalizeSourceScopes(root, scopes, 0);

  return scopes;
};

/** One membership set per scope, with `visible[ordinal]` holding the admitted local indices. */
const membership = (scopes: readonly SourceScope[], visible: ReadonlyArray<readonly number[]>): MembershipBits[] =>
  scopes.map((scope, ordinal) => {
    const bits = new MembershipBits();

    bits.reset(scope.items.count);

    for (const index of visible[ordinal] ?? []) {
      bits.set(index);
    }

    return bits;
  });

/** The order stream as handles rather than slots - i.e. WHICH items were drawn, in order. */
const orderedHandles = (state: DerivedSelectionState): number[] => {
  const handles: number[] = [];

  for (let i = 0; i < state.orderCount; i++) {
    handles.push(state.handleAt(state.order[i]!));
  }

  return handles;
};

describe('DerivedSelectionState', () => {
  describe('slot lifetime', () => {
    it('gives every admitted item a slot on the first update', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(4);
      state.update(root, membership(scopes, [[0, 2, 3]]), null);

      expect(state.stats.allocated).toBe(3);
      expect(state.stats.reused).toBe(0);
      expect(state.stats.released).toBe(0);
      expect(state.slotCount).toBe(3);
      expect(state.slotOf(1)).toBe(-1);
      expect(new Set([state.slotOf(0), state.slotOf(2), state.slotOf(3)]).size).toBe(3);
    });

    it('keeps a staying item on the slot it already had', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      const first = membership(scopes, [[0, 1, 2]]);

      state.rebind(4);
      state.update(root, first, null);

      const before = [state.slotOf(0), state.slotOf(1), state.slotOf(2)];

      state.update(root, membership(scopes, [[1, 2, 3]]), first);

      // 1 and 2 stayed: same slots, and NOT reported as entering - the backend
      // reads `entered` to decide what to write, so a stayer listed there would
      // rewrite data that never changed.
      expect(state.slotOf(1)).toBe(before[1]);
      expect(state.slotOf(2)).toBe(before[2]);
      expect(state.stats.retained).toBe(2);
      expect(state.stats.allocated).toBe(1);

      const enteredHandles = [];

      for (let i = 0; i < state.enteredCount; i++) {
        enteredHandles.push(state.entered[i * 3 + 1]!);
      }

      expect(enteredHandles).toEqual([3]);
    });

    it('returns an exited item’s slot and hands it to the next arrival', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      const first = membership(scopes, [[0]]);

      state.rebind(4);
      state.update(root, first, null);

      const vacated = state.slotOf(0);

      state.update(root, membership(scopes, [[1]]), first);

      expect(state.slotOf(0)).toBe(-1);
      expect(state.slotOf(1)).toBe(vacated);
      expect(state.stats.released).toBe(1);
      expect(state.stats.reused).toBe(1);
      // The whole point of the free list: a one-for-one swap must not grow the
      // space the backend has to allocate stores for.
      expect(state.slotCount).toBe(1);
    });

    it('never aliases two live items onto one slot across a churning sequence', () => {
      const root = createSourceScope();

      fill(root, 64);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      let previous: MembershipBits[] | null = null;

      state.rebind(64);

      for (let step = 0; step < 12; step++) {
        const visible: number[] = [];

        for (let i = 0; i < 64; i++) {
          if ((i + step * 5) % 3 !== 0) {
            visible.push(i);
          }
        }

        const current = membership(scopes, [visible]);

        state.update(root, current, previous);
        previous = current;

        const seen = new Map<number, number>();

        for (const index of visible) {
          const slot = state.slotOf(index);

          expect(slot).toBeGreaterThanOrEqual(0);
          expect(seen.has(slot)).toBe(false);
          seen.set(slot, index);
          expect(state.handleAt(slot)).toBe(index);
        }
      }
    });

    it('drops every assignment when the source is rebuilt', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(4);
      state.update(root, membership(scopes, [[0, 1]]), null);
      state.rebind(4);

      expect(state.slotOf(0)).toBe(-1);
      expect(state.slotCount).toBe(0);
      expect(state.matches(4)).toBe(true);
      expect(state.matches(5)).toBe(false);
    });
  });

  describe('order stream', () => {
    it('lists the admitted items in recorded order, not in slot order', () => {
      const root = createSourceScope();

      fill(root, 6);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      const first = membership(scopes, [[4, 5]]);

      state.rebind(6);
      state.update(root, first, null);

      // Admitting 0..3 afterwards hands them the slots ABOVE the two already
      // taken, so slot order and draw order now disagree - which is exactly the
      // case a physical-order draw would get wrong.
      state.update(root, membership(scopes, [[0, 1, 2, 3, 4, 5]]), first);

      expect(orderedHandles(state)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(state.order[0]).not.toBe(0);
      expect(state.stats.orderEntries).toBe(6);
    });

    it('splices a nested scope in at its recorded position', () => {
      const root = createSourceScope();

      fill(root, 4);

      const nested = nest(root, 3, 2);
      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      expect(nested.handleBase).toBe(4);

      state.rebind(7);
      state.update(root, membership(scopes, [[0, 1, 2, 3], [4, 5, 6].map(h => h - 4)]), null);

      // Root items 0,1 - then the nested scope's three - then root items 2,3.
      expect(orderedHandles(state)).toEqual([0, 1, 4, 5, 6, 2, 3]);
    });

    it('keeps a nested scope’s position when the item before it is culled', () => {
      const root = createSourceScope();

      fill(root, 4);
      nest(root, 2, 2);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(6);
      state.update(
        root,
        membership(scopes, [
          [0, 3],
          [0, 1],
        ]),
        null,
      );

      // Item 1 is not admitted, so the nested scope is reached at item 3 instead
      // - still after every root item recorded before it, still before item 3.
      expect(orderedHandles(state)).toEqual([0, 4, 5, 3]);
    });

    it('emits a trailing nested scope even when no later item reaches its mark', () => {
      const root = createSourceScope();

      fill(root, 3);
      nest(root, 2, 3);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(5);
      state.update(
        root,
        membership(scopes, [
          [0, 1, 2],
          [0, 1],
        ]),
        null,
      );

      expect(orderedHandles(state)).toEqual([0, 1, 2, 3, 4]);
    });

    it('produces nothing for an empty membership', () => {
      const root = createSourceScope();

      fill(root, 4);
      nest(root, 2, 1);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(6);
      state.update(root, membership(scopes, [[], []]), null);

      expect(state.orderCount).toBe(0);
      expect(state.stats.allocated).toBe(0);
    });
  });

  /**
   * What a structure delta does to the slot table. The property to pin is the
   * one a wrong implementation still renders plausibly for on a small scene: an
   * item that is merely renumbered must keep its slot, because the backend wrote
   * that slot's rows once and will not write them again.
   */
  describe('structure delta', () => {
    it('keeps a renumbered item on the slot it already had', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      const first = membership(scopes, [[0, 1, 2, 3]]);

      state.rebind(4);
      state.update(root, first, null);

      const before = [state.slotOf(0), state.slotOf(1), state.slotOf(2), state.slotOf(3)];

      // The middle item left the subtree and one arrived at the end, so the
      // three survivors are handles 0..2 and the arrival is handle 3.
      state.recarry(Int32Array.from([0, 2, 3, -1]), 4);

      expect(state.slotOf(0)).toBe(before[0]);
      expect(state.slotOf(1)).toBe(before[2]);
      expect(state.slotOf(2)).toBe(before[3]);
      expect(state.slotOf(3)).toBe(-1);
      // The departed item's slot is free rather than lost, so the arrival can
      // take it instead of growing the store.
      expect(state.stats.released).toBe(1);
    });

    it('hands the departed item’s slot to the arrival and writes only that one', () => {
      const root = createSourceScope();

      fill(root, 4);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();
      const first = membership(scopes, [[0, 1, 2, 3]]);

      state.rebind(4);
      state.update(root, first, null);

      const vacated = state.slotOf(1);

      state.recarry(Int32Array.from([0, 2, 3, -1]), 4);

      // Membership after the delta: every item is admitted, and the three
      // survivors were admitted before it.
      state.update(root, membership(scopes, [[0, 1, 2, 3]]), membership(scopes, [[0, 1, 2]]));

      expect(state.slotOf(3)).toBe(vacated);
      expect(state.stats.retained).toBe(3);
      expect(state.stats.allocated).toBe(1);
      expect(state.stats.reused).toBe(1);
      expect(state.slotCount).toBe(4);
      expect(orderedHandles(state)).toEqual([0, 1, 2, 3]);

      const enteredHandles = [];

      for (let i = 0; i < state.enteredCount; i++) {
        enteredHandles.push(state.entered[i * 3 + 1]!);
      }

      expect(enteredHandles).toEqual([3]);
    });

    it('releases the slot of an item the delta refused to carry', () => {
      const root = createSourceScope();

      fill(root, 2);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(2);
      state.update(root, membership(scopes, [[0, 1]]), null);

      // Handle 1 is still there but changed since its rows were written, so the
      // caller refuses to carry it: it has to enter again and be rewritten.
      state.recarry(Int32Array.from([0, -1]), 2);

      expect(state.slotOf(1)).toBe(-1);
      expect(state.stats.released).toBe(1);
    });

    it('carries nothing across a growing source that shares no items', () => {
      const root = createSourceScope();

      fill(root, 2);

      const scopes = finalize(root);
      const state = new DerivedSelectionState();

      state.rebind(2);
      state.update(root, membership(scopes, [[0, 1]]), null);
      state.recarry(Int32Array.from([-1, -1, -1]), 3);

      expect(state.slotOf(0)).toBe(-1);
      expect(state.slotOf(1)).toBe(-1);
      expect(state.slotOf(2)).toBe(-1);
      expect(state.stats.released).toBe(2);
    });
  });
});
