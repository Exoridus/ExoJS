import type { DrawCommand } from './RenderCommand';
import { RenderEntryKind } from './RenderCommand';
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
      const indexed = scope.entries.map((entry, index) => ({ entry, index }));

      indexed.sort((left, right) => {
        return left.entry.zIndex - right.entry.zIndex || left.entry.seq - right.entry.seq || left.index - right.index;
      });

      for (let i = 0; i < indexed.length; i++) {
        // In-bounds: i < indexed.length, and entries was the source of indexed.
        scope.entries[i] = indexed[i]!.entry;
      }
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
    // common case. The scan can only ever move a draw when the scope holds more
    // than one material AND is allowed to reorder; without both, every segment
    // walks its draws, allocates the per-z buckets, and then bails. A scope with
    // a single material is by far the most frequent shape, so gating here — not
    // deep inside `_overlapAwareGroup` — is what actually removes the cost.
    if (scope.hasMixedMaterial && !scope.preserveDrawOrder) {
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
   * The previous material is carried as its two numeric key fields rather than a
   * `${pipelineKey}:${bindKey}` string, so the walk allocates nothing per draw.
   */
  private static _assignGroupIndices(scope: GroupScope): void {
    let nextGroupIndex = 1;
    let hasPrev = false;
    let prevPipelineKey = 0;
    let prevBindKey = 0;
    let prevZ = 0;

    for (const entry of scope.entries) {
      if (entry.kind !== RenderEntryKind.Draw) {
        hasPrev = false;

        continue;
      }

      const material = entry.command.material;
      const z = entry.zIndex;

      if (!hasPrev || material.pipelineKey !== prevPipelineKey || material.bindKey !== prevBindKey || z !== prevZ) {
        nextGroupIndex++;
        hasPrev = true;
        prevPipelineKey = material.pipelineKey;
        prevBindKey = material.bindKey;
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
    // Bucket the z-group by material. The bucket index is a nested
    // pipelineKey -> bindKey -> bucket map rather than a `${pipelineKey}:${bindKey}`
    // string key: both ids come from monotonically growing intern registries
    // with no documented upper bound, so a bit-packed composite would be a
    // latent collision, and a string key would allocate once per draw.
    // `keyGroups` keeps the buckets in first-seen order, which is the order the
    // single-string map iterated in and the order the reorder below picks its
    // one winning bucket from.
    const bucketIndex = new Map<number, Map<number, DrawScopeEntry[]>>();
    const keyGroups: DrawScopeEntry[][] = [];

    for (const draw of zGroup) {
      const material = draw.command.material;
      let byBindKey = bucketIndex.get(material.pipelineKey);

      if (byBindKey === undefined) {
        byBindKey = new Map<number, DrawScopeEntry[]>();
        bucketIndex.set(material.pipelineKey, byBindKey);
      }

      const bucket = byBindKey.get(material.bindKey);

      if (bucket === undefined) {
        const created = [draw];

        byBindKey.set(material.bindKey, created);
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

      const midMaterial = mid.command.material;

      if (midMaterial.pipelineKey === groupMaterial.pipelineKey && midMaterial.bindKey === groupMaterial.bindKey) {
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
