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
 * Per-node content/structure revision pair (Track B, `D6`). Bumped at the
 * mutation site and propagated up the parent chain by
 * {@link SceneNode._markContentDirty} / `_markStructureDirty` — see
 * SceneNode.ts. `content` covers transform/tint/visual-source changes;
 * `structure` covers child add/remove/reorder and visibility. A structure
 * change also stamps `content` (conservative: whoever consumes a cached
 * fragment must treat a structural change as content-dirty too).
 * @internal
 */
export class NodeRevision {
  private _content = 0;
  private _structure = 0;

  public get content(): number {
    return this._content;
  }

  public get structure(): number {
    return this._structure;
  }

  public touchContent(revision: number): void {
    this._content = revision;
  }

  public touchStructure(revision: number): void {
    this._structure = revision;
    this._content = revision;
  }
}
