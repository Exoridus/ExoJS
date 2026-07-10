import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderNode } from '#rendering/RenderNode';

import type { RenderEntryKind } from './RenderCommand';
import type { RetainedDrawData } from './RetainedPlanCache';

/** A captured draw: replayed verbatim with a fresh frame-local nodeIndex. @internal */
export interface RetainedFragmentDraw extends RetainedDrawData {
  readonly kind: RenderEntryKind.Draw;
}

/** A captured nested group scope (a plain or retained Container below the group). @internal */
export interface RetainedFragmentGroup {
  readonly kind: RenderEntryKind.Group;
  readonly seq: number;
  readonly zIndex: number;
  readonly preserveDrawOrder: boolean;
  readonly transformNode: RenderNode | null;
  readonly entries: readonly RetainedFragmentEntry[];
}

/**
 * A barrier-effect node inside the fragment. NOT captured — re-dispatched
 * through a normal `_collect` on every replay (spec §8: semantics-neutral by
 * construction; the node reference stays valid because any change below it
 * content-dirties the owning RetainedContainer and drops the fragment).
 * @internal
 */
export interface RetainedFragmentBarrier {
  readonly kind: RenderEntryKind.Barrier;
  readonly seq: number;
  readonly node: RenderNode;
}

/** @internal */
export type RetainedFragmentEntry = RetainedFragmentDraw | RetainedFragmentGroup | RetainedFragmentBarrier;

/**
 * Whole-command-range fragment cache for one {@link RetainedContainer}
 * (Track B Slice 2, spec §4.2). Keyed on the subtree's aggregate
 * content/structure revision and the backend identity — deliberately NOT on
 * `View.updateId` (group-level culling makes the fragment view-independent;
 * this is the camera-pan win) and NOT on the container's own transform
 * (a group move only changes the group matrix, §4.3).
 */
export class RetainedGroupFragment {
  private _entries: readonly RetainedFragmentEntry[] = [];
  private _contentRevision = -1;
  private _structureRevision = -1;
  private _backend: RenderBackend | null = null;
  private _hasCapture = false;

  public get hasCapture(): boolean {
    return this._hasCapture;
  }

  public get entries(): readonly RetainedFragmentEntry[] {
    return this._entries;
  }

  public isClean(contentRevision: number, structureRevision: number, backend: RenderBackend): boolean {
    return this._hasCapture && this._contentRevision === contentRevision && this._structureRevision === structureRevision && this._backend === backend;
  }

  public capture(contentRevision: number, structureRevision: number, backend: RenderBackend, entries: readonly RetainedFragmentEntry[]): void {
    this._entries = entries;
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._backend = backend;
    this._hasCapture = true;
  }

  public invalidate(): void {
    this._hasCapture = false;
    this._entries = [];
  }
}
