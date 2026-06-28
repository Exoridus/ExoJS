import type { DrawCommand } from './RenderCommand';
import type { GroupScope } from './RenderScope';

/**
 * The canonical, reorderable unit of work in a render plan: a single draw
 * that the plan player submits to the backend.
 *
 * Today a render instruction is exactly a {@link DrawCommand}; the alias
 * names the concept the plan player consumes and that the batching layer
 * reorders, independent of how the draw happens to be stored in the scope
 * tree. Future {@link TransformBuffer} slotting keys on each instruction's
 * stable {@link DrawCommand.nodeIndex}. Each index is frame-global —
 * `[frameBase, frameBase + plan.nodeCount)` — because the transform buffer
 * is frame-scoped and the builder bases node indices at the current buffer
 * slot count (`frameBase`) so every plan in the frame occupies distinct
 * slots and can batch cross-call.
 *
 * Batch units (maximal runs of consecutive instructions in a {@link GroupScope}
 * sharing GPU pipeline/bind state) are not materialized: the plan player walks
 * each instruction's {@link DrawCommand.groupIndex} adjacency directly over
 * `scope.entries` (Slice 2c), and the upload-boundary hooks receive an entries
 * range rather than a collected group array — keeping playback allocation-free.
 *
 * @internal
 */
export type RenderInstruction = DrawCommand;
