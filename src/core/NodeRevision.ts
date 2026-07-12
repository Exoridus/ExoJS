let globalTick = 0;

/**
 * Advance and return the shared monotonic revision counter stamped onto
 * {@link NodeRevision} instances across the whole scene graph. A single
 * process-wide source of truth means two stamped values only ever need a
 * `!==` comparison — no per-node clock to keep in sync.
 * @internal
 */
export const nextNodeRevision = (): number => ++globalTick;

/**
 * Per-node content/structure/transform revision triple (Track B, `D6` +
 * Slice 4a). Bumped at the mutation site and propagated up the parent chain by
 * {@link SceneNode._markContentDirty} / `_markStructureDirty` /
 * `_markTransformDirty` — see SceneNode.ts. `content` covers tint/visual-source
 * changes; `structure` covers child add/remove/reorder and visibility; a
 * structure change also stamps `content` (conservative: whoever consumes a
 * cached fragment must treat a structural change as content-dirty too).
 *
 * `transform` is an ORTHOGONAL channel (Slice 4a) bumped by own-transform
 * mutations (position/rotation/scale/skew/origin). It does not stamp `content`
 * or vice versa: it exists so a {@link RetainedContainer} can distinguish a
 * transform-only descendant move (patch the group's transform rows in place)
 * from a content change (re-collect). In Slice 4a own-transform mutations still
 * ALSO bump `content` (the split is additive, behaviour-neutral); Slice 4b drops
 * that content co-bump once the row-patch path exists.
 * @internal
 */
export class NodeRevision {
  private _content = 0;
  private _structure = 0;
  private _transform = 0;

  public get content(): number {
    return this._content;
  }

  public get structure(): number {
    return this._structure;
  }

  public get transform(): number {
    return this._transform;
  }

  public touchContent(revision: number): void {
    this._content = revision;
  }

  public touchStructure(revision: number): void {
    this._structure = revision;
    this._content = revision;
  }

  public touchTransform(revision: number): void {
    this._transform = revision;
  }
}
