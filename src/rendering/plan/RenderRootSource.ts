import type { ReadonlyRectangle } from '#math/Rectangle';

import { FlatScanVisibility, type RenderItemVisibility } from './RenderItemVisibility';
import type { RetainedFragmentDraw, RetainedFragmentEntry } from './RetainedGroupFragment';

/**
 * @internal
 *
 * The persistent, view-INDEPENDENT items of one render root: every drawable in
 * the subtree with its recorded order and world bounds, whether or not it is
 * currently on screen.
 *
 * This is the piece a captured product cannot supply. A capture holds what the
 * camera admitted at capture time, so an item that has since scrolled into view
 * is precisely the one it does not contain — which is why a view change outside
 * the capture margin had to rebuild the whole plan from the scene graph, at
 * ~0.4us per node (400ms at a million).
 *
 * With the source present, that rebuild becomes a selection: walk the items,
 * keep the ones the new rect admits, and emit only those. The scene graph is not
 * touched, no transform is resolved for a rejected item, and no material key is
 * computed for one.
 *
 * Ownership is per render root, not per node. Visibility and records are
 * per-root and per-view, so a node rendered under two roots genuinely has two
 * states; a single owner slot on the node would make the two roots overwrite
 * each other every frame. Contract 5 of the architecture freeze
 * (`.workspace/rendering-optimization-O34-final.md`) requires exactly this.
 *
 * Deliberately carries nothing root-specific: the view selection, the ancestry
 * stamp and the render target stay in {@link RetainedRootRepresentation} above
 * it, so `RetainedContainer` can adopt this same source later instead of
 * becoming a third implementation of the same idea.
 */
export class RenderRootSource {
  /** The culling-free item snapshot, in recorded order. */
  private _entries: readonly RetainedFragmentEntry[] = [];
  private _hasItems = false;
  private _contentRevision = -1;
  private _structureRevision = -1;

  /** Swappable because which strategy wins is a measurement (see the seam's doc). */
  public visibility: RenderItemVisibility = new FlatScanVisibility();

  /** Whether items exist and still describe this content/structure. */
  public isUsable(contentRevision: number, structureRevision: number): boolean {
    return this._hasItems && this._contentRevision === contentRevision && this._structureRevision === structureRevision;
  }

  /** The items, valid only while {@link isUsable} holds. */
  public get entries(): readonly RetainedFragmentEntry[] {
    return this._entries;
  }

  /**
   * Adopt a fresh culling-free snapshot.
   *
   * The caller owns the entry list; the source only keys it. A structure or
   * content change invalidates rather than patches — the incremental channels
   * for those are separate work (`NEU-O47`/`NEU-O49`), and the case this cut
   * exists for is a moving camera over unchanged content.
   */
  public adopt(entries: readonly RetainedFragmentEntry[], contentRevision: number, structureRevision: number): void {
    this._entries = entries;
    this._contentRevision = contentRevision;
    this._structureRevision = structureRevision;
    this._hasItems = true;
  }

  /** Whether the rect admits this item; delegates to the active strategy. */
  public admits(draw: RetainedFragmentDraw, rect: ReadonlyRectangle): boolean {
    return this.visibility.admits(draw, rect);
  }

  /** Drop the items (structure/content changed, or the root was destroyed). */
  public invalidate(): void {
    this._entries = [];
    this._hasItems = false;
    this._contentRevision = -1;
    this._structureRevision = -1;
  }
}
