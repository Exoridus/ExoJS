import type { Drawable } from '#rendering/Drawable';
import type { RenderNode } from '#rendering/RenderNode';

import { RenderEntryKind } from './renderCommand';
import { adoptScopeContents, createSourceScope, type SourceGroup, type SourceScope } from './renderSourceItem';
import type { SourceDeltaTargets } from './SourceStructureDelta';

/** What a re-derivation needs from the builder running the source walk. */
export interface SourceRederivationHost {
  /** Run `node`'s collect with `scope` recording and `previous` as what it may carry. */
  _collectSourceInto(node: RenderNode, scope: SourceScope, previous: SourceScope | null): void;
  _resolvePreserveDrawOrder(node: RenderNode): boolean;
  /** Whether `node` was observed reading the view during the current walk. */
  _sourceReadsView(node: RenderNode): boolean;
}

/**
 * The carry decisions of a structure delta's re-derivation, and the stack that
 * says what each level of the source walk may carry from.
 *
 * A re-derivation re-runs a scope's collect and, per emitted drawable and per
 * nested container, keeps what the scope recorded last time whenever nothing
 * marked since the source's change cursor touched it: a carried item keeps its
 * stored bounds without being asked, a carried group keeps its items and index
 * without being walked. Everything else takes the discovery path, so the
 * outcome is what a rebuild would have produced, minus the work it would have
 * repeated.
 */
export class SourceRederivation {
  /**
   * Parallel to the builder's source stack: the scope whose recorded contents
   * the walk at that level may carry, or `null` where the level is being
   * discovered from scratch so nothing below it is ever carried.
   */
  private readonly _previous: Array<SourceScope | null> = [];
  /** Change cursor of the source under re-derivation; a mark newer than it disqualifies a carry. */
  private _cursor = -1;
  /** Carry epoch stamped on the source's drawables before the re-derivation began. */
  private _epoch = 0;
  private _targets: SourceDeltaTargets | null = null;
  /** A nested re-derivation hit a case only a rebuild can express. */
  private _failed = false;

  public begin(cursor: number, epoch: number, targets: SourceDeltaTargets): void {
    this._cursor = cursor;
    this._epoch = epoch;
    this._targets = targets;
    this._failed = false;
  }

  /** Whether the re-derivation begun last has to be answered with a rebuild. */
  public end(): boolean {
    this._targets = null;

    return this._failed;
  }

  public push(previous: SourceScope | null): void {
    this._previous.push(previous);
  }

  public pop(): void {
    this._previous.pop();
  }

  public reset(): void {
    this._previous.length = 0;
    this._targets = null;
  }

  /** What the walk at source-stack `level` may carry from, or `null`. */
  public previousAt(level: number): SourceScope | null {
    return this._previous[level] ?? null;
  }

  /**
   * A drawable the scope recorded last time as its one item, untouched since,
   * keeps its stored bounds.
   *
   * The carry handle is only trusted when it points back into THIS scope at the
   * drawable itself. A handle into another scope means the node moved between
   * containers; a drawable that emitted more than one item, or something other
   * than itself, never holds a handle to itself. Both are collected afresh.
   */
  public carryItem(drawable: Drawable, scope: SourceScope, previous: SourceScope, seq: number, zIndex: number): boolean {
    if (drawable._sourceCarryEpoch !== this._epoch) {
      return false;
    }

    const local = drawable._sourceCarryHandle - previous.handleBase;

    if (local < 0 || local >= previous.items.count || previous.items.drawables[local] !== drawable) {
      return false;
    }

    scope.items.pushFrom(previous.items, local, seq, zIndex);

    return true;
  }

  /**
   * A container the scope recorded last time: keep the recorded group when
   * nothing about the container itself changed, re-derive it in place when only
   * its child list did, and answer `false` for anything else so the caller
   * discovers it afresh.
   *
   * A transform or tint mark on the container means its subtree's stored bounds
   * and prepacked rows are stale; a content mark does not, it is what a
   * child-list change leaves on the container itself.
   *
   * The lookup walks the previous scope's `others` rather than a map: nested
   * containers are few per scope, and a per-frame map over them is the
   * allocation the delta exists to avoid.
   */
  public carryGroup(host: SourceRederivationHost, node: RenderNode, scope: SourceScope, previous: SourceScope, seq: number, zIndex: number): boolean {
    const group = recordedGroupOf(previous, node);

    if (group === null) {
      return false;
    }

    const cursor = this._cursor;

    if (node._transformMarkSequence > cursor || node._tintMarkSequence > cursor || group.preserveDrawOrder !== host._resolvePreserveDrawOrder(node)) {
      return false;
    }

    const mark = scope.items.count;

    if (node._structureMarkSequence > cursor) {
      if (!this._targets!.isTarget(group)) {
        return false;
      }

      const fresh = createSourceScope();

      host._collectSourceInto(node, fresh, group);

      // A container that started reading the view has to become a live entry,
      // and its recorded contents have to go: a rebuild's decision to make.
      if (host._sourceReadsView(node)) {
        this._failed = true;

        return true;
      }

      adoptScopeContents(group, fresh);
    }

    group.seq = seq;
    group.zIndex = zIndex;
    group.itemMark = mark;
    scope.others.push(group);

    return true;
  }
}

const recordedGroupOf = (previous: SourceScope, node: RenderNode): SourceGroup | null => {
  for (const other of previous.others) {
    if (other.kind === RenderEntryKind.Group && other.node === node) {
      return other;
    }
  }

  return null;
};
