import type { DrawCommand, MaterialKey } from './RenderCommand';
import { RenderEntryKind } from './RenderCommand';
import type { RenderPlan } from './RenderPlan';
import type { DrawScopeEntry, GroupScope, ScopeEntry } from './RenderScope';

const groupKey = (material: MaterialKey): string => `${material.pipelineKey}:${material.bindKey}`;

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

    let segStart = 0;

    for (let i = 0; i <= n; i++) {
      // In-bounds when i < n.
      const entry = i < n ? entries[i]! : null;
      const isBoundary = entry === null || entry.kind === RenderEntryKind.Group || entry.kind === RenderEntryKind.Barrier;

      if (isBoundary && i > segStart) {
        const segEnd = i;
        const segLen = segEnd - segStart;

        if (segLen >= 1) {
          this._materialGroupSegment(entries, segStart, segEnd, scope.preserveDrawOrder);
        }

        segStart = i + 1;
      } else if (isBoundary) {
        segStart = i + 1;
      }
    }

    this._assignGroupIndices(scope);
  }

  private static _assignGroupIndices(scope: GroupScope): void {
    let nextGroupIndex = 1;
    let prevKey: string | null = null;
    let prevZ: number | null = null;

    for (const entry of scope.entries) {
      if (entry.kind !== RenderEntryKind.Draw) {
        prevKey = null;
        prevZ = null;

        continue;
      }

      const key = groupKey(entry.command.material);
      const z = entry.zIndex;

      if (prevKey === null || prevZ === null || key !== prevKey || z !== prevZ) {
        nextGroupIndex++;
        prevKey = key;
        prevZ = z;
      }

      entry.command.groupIndex = nextGroupIndex;
    }
  }

  private static _materialGroupSegment(entries: ScopeEntry[], start: number, end: number, preserveDrawOrder: boolean): void {
    const len = end - start;

    if (len <= 1) {
      return;
    }

    const draws: Array<{ entry: DrawScopeEntry; origIdx: number }> = [];

    for (let i = start; i < end; i++) {
      // In-bounds: start..end-1 lie within entries.
      const entry = entries[i]!;

      if (entry.kind === RenderEntryKind.Draw) {
        draws.push({ entry, origIdx: i });
      }
    }

    if (draws.length <= 1) {
      return;
    }

    if (!preserveDrawOrder) {
      const zGroups = new Map<number, Array<{ entry: DrawScopeEntry; origIdx: number }>>();

      for (const d of draws) {
        const z = d.entry.zIndex;
        const list = zGroups.get(z) ?? [];

        list.push(d);
        zGroups.set(z, list);
      }

      for (const zGroup of zGroups.values()) {
        if (zGroup.length > 1) {
          this._overlapAwareGroup(zGroup, entries, start, end);
        }
      }
    }
  }

  private static _overlapAwareGroup(zGroup: Array<{ entry: DrawScopeEntry; origIdx: number }>, entries: ScopeEntry[], segStart: number, segEnd: number): void {
    const keyGroups = new Map<string, Array<{ entry: DrawScopeEntry; origIdx: number }>>();

    for (const d of zGroup) {
      const key = groupKey(d.entry.command.material);
      const list = keyGroups.get(key) ?? [];

      list.push(d);
      keyGroups.set(key, list);
    }

    if (keyGroups.size <= 1) {
      return;
    }

    for (const group of keyGroups.values()) {
      if (group.length <= 1) {
        continue;
      }

      const positions: number[] = [];

      for (const g of group) {
        const pos = entries.indexOf(g.entry, segStart);

        if (pos >= segStart && pos < segEnd) {
          positions.push(pos);
        }
      }

      positions.sort((a, b) => a - b);

      if (positions.length === 0) {
        continue;
      }

      // Non-empty (guarded above); positions are valid indices in [segStart, segEnd).
      const first = positions[0]!;
      const last = positions[positions.length - 1]!;

      if (last - first + 1 === positions.length) {
        continue;
      }

      let blocked = false;

      for (let p = first + 1; p < last && !blocked; p++) {
        // In-bounds: p in (first, last) ⊂ [segStart, segEnd).
        const mid = entries[p]!;

        if (mid.kind !== RenderEntryKind.Draw) {
          continue;
        }

        const midKey = groupKey(mid.command.material);

        // group has length >= 1 (guarded above).
        if (midKey === groupKey(group[0]!.entry.command.material)) {
          continue;
        }

        for (const g of group) {
          if (aabbOverlap(g.entry.command, mid.command)) {
            blocked = true;

            break;
          }
        }
      }

      if (blocked) {
        continue;
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

      const groupSet = new Set(group.map(g => g.entry));
      const betweenNonGroup: ScopeEntry[] = [];

      for (let p = first; p <= last; p++) {
        // In-bounds: first..last ⊂ [segStart, segEnd).
        const entry = entries[p]!;

        if (!groupSet.has(entry as DrawScopeEntry)) {
          betweenNonGroup.push(entry);
        }
      }

      const groupEntries: ScopeEntry[] = group.map(g => g.entry);
      const reordered: ScopeEntry[] = [...beforeFirst, ...groupEntries, ...betweenNonGroup, ...afterLast];

      for (let p = segStart; p < segEnd; p++) {
        // reordered has exactly segEnd-segStart entries; p-segStart is in-bounds.
        entries[p] = reordered[p - segStart]!;
      }

      break;
    }
  }
}
