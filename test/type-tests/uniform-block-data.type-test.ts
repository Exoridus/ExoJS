/**
 * `UniformBlockData` satisfies the accessor sink contract without declaring it.
 *
 * The class deliberately carries no `implements UniformRevisionSink`: that
 * clause reaches the emitted declaration, and the interface is `@internal`, so
 * `stripInternal` drops it from the shipped `.d.ts` and leaves the class's own
 * declaration importing a member a consumer cannot resolve. Structural typing
 * makes the clause unnecessary at the call sites; this file is what keeps the
 * conformance checked.
 *
 * Run by `typecheck:type-tests`.
 */
import type { UniformRevisionSink } from '#rendering/uniforms/uniformAccessors';
import { type UniformBlockData } from '#rendering/uniforms/UniformBlockData';

const sink: UniformRevisionSink = null as unknown as UniformBlockData;

void sink;
