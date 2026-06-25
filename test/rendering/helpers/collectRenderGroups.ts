import { type DrawCommand, type MaterialKey, RenderEntryKind } from '#rendering/plan/RenderCommand';
import type { GroupScope, ScopeEntry } from '#rendering/plan/RenderScope';

/**
 * A materialized batch unit: a maximal run of consecutive draw commands within a
 * single {@link GroupScope} that share a GPU pipeline/bind state and may
 * therefore be submitted together.
 *
 * The optimizer ({@link RenderPlanOptimizer}) stamps this grouping implicitly
 * onto each {@link DrawCommand.groupIndex}; a `RenderGroup` makes that batch unit
 * explicit as a value. The plan player no longer materializes these per frame —
 * it walks `groupIndex` adjacency over `scope.entries` inline (Slice 2c). This
 * collector survives only as a **test helper**: render-plan tests assert grouping
 * structure against it without re-deriving the adjacency rule, and the upload-
 * boundary mocks reconstruct the group's commands from the entries range.
 *
 * @internal Test-only.
 */
export interface RenderGroup {
  /** Optimizer-assigned batch identity shared by every command in the run. */
  readonly groupIndex: number;
  /** Pipeline/bind state shared by the run; taken from its first command. */
  readonly material: MaterialKey;
  /** Draw commands in submit order. */
  readonly instructions: readonly DrawCommand[];
}

interface MutableRenderGroup {
  groupIndex: number;
  material: MaterialKey;
  instructions: DrawCommand[];
}

/**
 * Materialize the {@link RenderGroup} batch units contained directly in `scope`.
 * Consecutive draw commands that share a defined `groupIndex` coalesce into one
 * group; any non-draw entry (a nested group or barrier) breaks the run, and a
 * draw whose `groupIndex` is still `undefined` (i.e. the plan has not been
 * optimized) forms its own singleton group — mirroring the adjacency semantics
 * the plan player walks inline and the mesh renderers rely on.
 *
 * @internal Test-only.
 */
export const collectRenderGroups = (scope: GroupScope): RenderGroup[] => {
  const groups: RenderGroup[] = [];
  let current: MutableRenderGroup | null = null;

  for (const entry of scope.entries) {
    if (entry.kind !== RenderEntryKind.Draw) {
      current = null;

      continue;
    }

    const command = entry.command;
    const groupIndex = command.groupIndex;

    if (current !== null && groupIndex !== undefined && groupIndex === current.groupIndex) {
      current.instructions.push(command);

      continue;
    }

    current = {
      groupIndex: groupIndex ?? 0,
      material: command.material,
      instructions: [command],
    };
    groups.push(current);

    if (groupIndex === undefined) {
      // Unoptimized / non-batchable draw: never coalesce with the next one.
      current = null;
    }
  }

  return groups;
};

/**
 * Iterate the draw commands of the group range `[startIndex, startIndex + count)`
 * the refactored plan-player hooks pass. Every entry in a group range is a draw,
 * so this is the read-only equivalent of looping a materialized group's
 * `instructions` — letting the upload-boundary mocks pack exactly the same
 * commands while the production player passes only an entries range.
 *
 * @internal Test-only.
 */
export const forEachGroupCommand = (entries: readonly ScopeEntry[], startIndex: number, count: number, visit: (command: DrawCommand) => void): void => {
  for (let i = startIndex; i < startIndex + count; i++) {
    const entry = entries[i];

    if (entry?.kind !== RenderEntryKind.Draw) {
      throw new Error(`forEachGroupCommand: entry ${i} in [${startIndex}, ${startIndex + count}) is not a draw`);
    }

    visit(entry.command);
  }
};

/**
 * Reconstruct the {@link RenderGroup} a plan-player upload boundary describes
 * from the `(entries, startIndex, count)` range the refactored hooks pass. Lets
 * the begin/end/upload mocks keep asserting against a `RenderGroup` (e.g. its
 * `instructions`' drawable ids) while the production player passes only a range.
 *
 * @internal Test-only.
 */
export const renderGroupFromRange = (entries: readonly ScopeEntry[], startIndex: number, count: number): RenderGroup => {
  const instructions: DrawCommand[] = [];

  forEachGroupCommand(entries, startIndex, count, command => instructions.push(command));

  const first = instructions[0];

  if (first === undefined) {
    throw new Error('renderGroupFromRange: empty group range');
  }

  return {
    groupIndex: first.groupIndex ?? 0,
    material: first.material,
    instructions,
  };
};
