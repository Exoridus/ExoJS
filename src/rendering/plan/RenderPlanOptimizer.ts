import type { DrawCommand, MaterialKey } from './RenderCommand';
import { forcesBatchFlush, RenderEntryKind } from './RenderCommand';
import type { RenderPlan } from './RenderPlan';
import type { DrawScopeEntry, GroupScope, ScopeEntry } from './RenderScope';

const aabbOverlap = (a: DrawCommand, b: DrawCommand): boolean => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/** @internal */
export class RenderPlanOptimizer {
  public static optimize(plan: RenderPlan): void {
    for (const pass of plan.passes) {
      this._optimizeGroup(pass.root);
    }
  }

  private static _optimizeGroup(scope: GroupScope): void {
    if (scope.hasMixedZ) {
      // Sorted in place, with no index tiebreak. `seq` is unique within a scope —
      // `RenderPlanBuilder._reserveEntryPlacement` advances `_nextSeq` past every
      // placement and the retained-replay path mirrors that — so the comparator is
      // already a total order and an index tiebreak can never be reached; even if
      // it could, `Array.prototype.sort` is stable as of ES2019. The wrapper the
      // sort used to run over cost one `{ entry, index }` object per entry plus one
      // array and one writeback loop per frame, on a path no gate protects: every
      // scope with a `zIndex` pays it every frame.
      scope.entries.sort((left, right) => left.zIndex - right.zIndex || left.seq - right.seq);
    }

    this._applyMaterialGrouping(scope);

    for (const entry of scope.entries) {
      if (entry.kind === RenderEntryKind.Group) {
        this._optimizeGroup(entry.scope);
      } else if (entry.kind === RenderEntryKind.Barrier && entry.scope.childPlan !== null) {
        this._optimizeGroup(entry.scope.childPlan);
      }
    }
  }

  private static _applyMaterialGrouping(scope: GroupScope): void {
    const entries = scope.entries;
    const n = entries.length;

    if (n === 0) {
      return;
    }

    // Two O(1) prechecks that make the whole segment scan disappear in the
    // common case. The scan can only ever save a draw call when the scope holds
    // draws that would flush against each other AND is allowed to reorder;
    // without both, every segment walks its draws, allocates the per-z buckets,
    // and then bails. Gating here — not deep inside `_overlapAwareGroup` — is
    // what actually removes the cost.
    //
    // The flag is `hasMixedPipeline`, not "more than one material key": a scope
    // over two atlases with one shader differs in `bindKey` on every second draw
    // and still batches into a single draw call, so scanning it every frame buys
    // a reorder worth exactly zero draw calls.
    if (scope.hasMixedPipeline && !scope.preserveDrawOrder) {
      let segStart = 0;

      for (let i = 0; i <= n; i++) {
        // In-bounds when i < n.
        const entry = i < n ? entries[i]! : null;
        const isBoundary = entry === null || entry.kind === RenderEntryKind.Group || entry.kind === RenderEntryKind.Barrier;

        if (isBoundary && i > segStart) {
          this._materialGroupSegment(entries, segStart, i);
        }

        if (isBoundary) {
          segStart = i + 1;
        }
      }
    }

    this._assignGroupIndices(scope);
  }

  /**
   * Assigns the adjacency `groupIndex` the backends batch on. Runs on every
   * scope unconditionally — unlike the reordering above, this is not an
   * optimization the plan can go without.
   *
   * The break condition is {@link forcesBatchFlush}, matching the batcher: a run
   * ends where the batcher would actually flush. Breaking on any `bindKey` change
   * instead would split a default-path run over several atlases into single-draw
   * groups that carry no batch boundary at all, fragmenting the player's
   * transform upload for nothing.
   *
   * The comparison runs against the run's FIRST draw, not its immediate
   * predecessor: `forcesBatchFlush` is not transitive across the default/custom
   * path boundary, and the first draw is the conservative anchor.
   */
  private static _assignGroupIndices(scope: GroupScope): void {
    let nextGroupIndex = 1;
    let prev: MaterialKey | null = null;
    let prevZ = 0;

    for (const entry of scope.entries) {
      if (entry.kind !== RenderEntryKind.Draw) {
        prev = null;

        continue;
      }

      const material = entry.command.material;
      const z = entry.zIndex;

      if (prev === null || z !== prevZ || forcesBatchFlush(prev, material)) {
        nextGroupIndex++;
        prev = material;
        prevZ = z;
      }

      entry.command.groupIndex = nextGroupIndex;
    }
  }

  private static _materialGroupSegment(entries: ScopeEntry[], start: number, end: number): void {
    if (end - start <= 1) {
      return;
    }

    const draws: DrawScopeEntry[] = [];

    for (let i = start; i < end; i++) {
      // In-bounds: start..end-1 lie within entries.
      const entry = entries[i]!;

      if (entry.kind === RenderEntryKind.Draw) {
        draws.push(entry);
      }
    }

    if (draws.length <= 1) {
      return;
    }

    const zGroups = new Map<number, DrawScopeEntry[]>();

    for (const draw of draws) {
      const list = zGroups.get(draw.zIndex);

      if (list === undefined) {
        zGroups.set(draw.zIndex, [draw]);
      } else {
        list.push(draw);
      }
    }

    for (const zGroup of zGroups.values()) {
      if (zGroup.length > 1) {
        this._overlapAwareGroup(zGroup, entries, start, end);
      }
    }
  }

  private static _overlapAwareGroup(zGroup: DrawScopeEntry[], entries: ScopeEntry[], segStart: number, segEnd: number): void {
    // Bucket the z-group by what would make the batcher flush between two draws,
    // which is what a reorder can save — see `forcesBatchFlush`. Default-path
    // draws all collapse into their pipeline's single `-1` sub-bucket regardless
    // of texture, because the 16 texture slots batch them as they are; only a
    // draw carrying its own Material splits further, by its `bindKey`. The
    // sentinel also keeps the two paths apart, so a default-path `pipelineKey`
    // (`rendererId * 31 + blendMode`) colliding with a Material's interned one
    // cannot merge buckets that must not batch together.
    //
    // The index is a nested pipelineKey -> bindKey -> bucket map rather than a
    // `${pipelineKey}:${bindKey}` string key: both ids come from monotonically
    // growing intern registries with no documented upper bound, so a bit-packed
    // composite would be a latent collision, and a string key would allocate once
    // per draw. `keyGroups` keeps the buckets in first-seen order, which is the
    // order the reorder below picks its one winning bucket from.
    const bucketIndex = new Map<number, Map<number, DrawScopeEntry[]>>();
    const keyGroups: DrawScopeEntry[][] = [];

    for (const draw of zGroup) {
      const material = draw.command.material;
      const bindSubKey = material.ownMaterial ? material.bindKey : -1;
      let byBindKey = bucketIndex.get(material.pipelineKey);

      if (byBindKey === undefined) {
        byBindKey = new Map<number, DrawScopeEntry[]>();
        bucketIndex.set(material.pipelineKey, byBindKey);
      }

      const bucket = byBindKey.get(bindSubKey);

      if (bucket === undefined) {
        const created = [draw];

        byBindKey.set(bindSubKey, created);
        keyGroups.push(created);
      } else {
        bucket.push(draw);
      }
    }

    if (keyGroups.length <= 1) {
      return;
    }

    // O(1) position lookup. Each `entries.indexOf(entry, segStart)` below was an
    // O(n) scan; with many same-z draws (e.g. cycled textures over a flat list)
    // that made this method O(n^2). A scope's entries are distinct objects, so a
    // single Map over `entries[segStart..segEnd)` yields the same first-match
    // index `indexOf` returned — and this method performs at most one reorder,
    // after which it returns, so no lookup ever runs against stale positions
    // (the map stays valid for the whole scan).
    const positionIndex = new Map<ScopeEntry, number>();

    for (let i = segStart; i < segEnd; i++) {
      // In-bounds: i in [segStart, segEnd).
      positionIndex.set(entries[i]!, i);
    }

    for (const group of keyGroups) {
      if (this._tryReorderKeyGroup(group, entries, segStart, segEnd, positionIndex)) {
        return;
      }
    }
  }

  /**
   * Attempts to pull one material bucket's draws together into a contiguous run.
   * Returns `true` when `entries[segStart..segEnd)` was rewritten, which ends the
   * scan: the reorder invalidates the caller's `positionIndex`, so at most one
   * bucket may win per segment.
   */
  private static _tryReorderKeyGroup(
    group: DrawScopeEntry[],
    entries: ScopeEntry[],
    segStart: number,
    segEnd: number,
    positionIndex: Map<ScopeEntry, number>,
  ): boolean {
    if (group.length <= 1) {
      return false;
    }

    const positions: number[] = [];

    for (const draw of group) {
      const pos = positionIndex.get(draw);

      // The map holds only entries in [segStart, segEnd); a hit is in range.
      if (pos !== undefined) {
        positions.push(pos);
      }
    }

    positions.sort((a, b) => a - b);

    if (positions.length === 0) {
      return false;
    }

    // Non-empty (guarded above); positions are valid indices in [segStart, segEnd).
    const first = positions[0]!;
    const last = positions[positions.length - 1]!;

    if (last - first + 1 === positions.length) {
      return false;
    }

    // group has length >= 1 (guarded above).
    const groupMaterial = group[0]!.command.material;

    for (let p = first + 1; p < last; p++) {
      // In-bounds: p in (first, last) ⊂ [segStart, segEnd).
      const mid = entries[p]!;

      if (mid.kind !== RenderEntryKind.Draw) {
        continue;
      }

      // A draw the moved run would batch with anyway is not an obstacle — same
      // criterion the buckets were built on.
      if (!forcesBatchFlush(groupMaterial, mid.command.material)) {
        continue;
      }

      for (const draw of group) {
        if (aabbOverlap(draw.command, mid.command)) {
          return false;
        }
      }
    }

    const beforeFirst: ScopeEntry[] = [];

    for (let p = segStart; p < first; p++) {
      // In-bounds: p < first <= segEnd.
      beforeFirst.push(entries[p]!);
    }

    const afterLast: ScopeEntry[] = [];

    for (let p = last + 1; p < segEnd; p++) {
      // In-bounds: p < segEnd.
      afterLast.push(entries[p]!);
    }

    const groupSet = new Set<ScopeEntry>(group);
    const betweenNonGroup: ScopeEntry[] = [];

    for (let p = first; p <= last; p++) {
      // In-bounds: first..last ⊂ [segStart, segEnd).
      const entry = entries[p]!;

      if (!groupSet.has(entry)) {
        betweenNonGroup.push(entry);
      }
    }

    const reordered: ScopeEntry[] = [...beforeFirst, ...group, ...betweenNonGroup, ...afterLast];

    for (let p = segStart; p < segEnd; p++) {
      // reordered has exactly segEnd-segStart entries; p-segStart is in-bounds.
      entries[p] = reordered[p - segStart]!;
    }

    return true;
  }
}
