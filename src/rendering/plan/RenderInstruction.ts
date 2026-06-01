import { type DrawCommand, type MaterialKey, RenderEntryKind } from './RenderCommand';
import type { GroupScope } from './RenderScope';

/**
 * The canonical, reorderable unit of work in a render plan: a single draw
 * that the plan player submits to the backend.
 *
 * Today a render instruction is exactly a {@link DrawCommand}; the alias
 * names the concept the plan player consumes and that the batching layer
 * reorders, independent of how the draw happens to be stored in the scope
 * tree. Future {@link TransformBuffer} slotting keys on each instruction's
 * stable {@link DrawCommand.nodeIndex} (within the `[0, plan.nodeCount)`
 * slot space).
 *
 * @internal
 */
export type RenderInstruction = DrawCommand;

/**
 * A materialized batch unit: a maximal run of consecutive
 * {@link RenderInstruction}s within a single {@link GroupScope} that share a
 * GPU pipeline/bind state and may therefore be submitted together.
 *
 * The optimizer ({@link RenderPlanOptimizer}) already stamps this grouping
 * implicitly onto each {@link DrawCommand.groupIndex}; a `RenderGroup` makes
 * that batch unit explicit as a value without altering playback. The mesh
 * renderers continue to detect batches by comparing adjacent `groupIndex`es,
 * so this representation is purely additive.
 *
 * @internal
 */
export interface RenderGroup {
  /** Optimizer-assigned batch identity shared by every instruction in the run. */
  readonly groupIndex: number;
  /** Pipeline/bind state shared by the run; taken from its first instruction. */
  readonly material: MaterialKey;
  /** Draw instructions in submit order. */
  readonly instructions: readonly RenderInstruction[];
}

interface MutableRenderGroup {
  groupIndex: number;
  material: MaterialKey;
  instructions: RenderInstruction[];
}

/**
 * Materialize the {@link RenderGroup} batch units contained directly in
 * `scope`. Consecutive draw instructions that share a defined `groupIndex`
 * coalesce into one group; any non-draw entry (a nested group or barrier)
 * breaks the run, and a draw whose `groupIndex` is still `undefined` (i.e.
 * the plan has not been optimized) forms its own singleton group — mirroring
 * the adjacency semantics the mesh renderers already rely on.
 *
 * This is a read-only view over an (optimized) scope; it does not mutate the
 * plan or affect playback order.
 *
 * @internal
 */
export function collectRenderGroups(scope: GroupScope): RenderGroup[] {
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
}
