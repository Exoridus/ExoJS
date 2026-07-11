import { Matrix } from '#math/Matrix';
import type { RenderBackend } from '#rendering/RenderBackend';

import { RenderEntryKind } from './RenderCommand';
import { RenderEffectExecutor } from './RenderEffectExecutor';
import type { RenderInstruction } from './RenderInstruction';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope, RenderScope, ScopeEntry } from './RenderScope';
import {
  type RetainedBatchInstruction,
  type RetainedInstruction,
  RetainedInstructionKind,
  type RetainedInstructionSet,
  retainedLeaveGroupInstruction,
} from './RetainedInstructionSet';

interface RenderInstructionSlot {
  readonly groupInstructionIndex: number;
  readonly passInstructionIndex: number;
}

interface RenderGroupPlaybackContext {
  readonly groupInstructionCount: number;
  readonly firstPassInstructionIndex: number;
  readonly lastPassInstructionIndex: number;
  readonly passGroupIndex: number;
}

interface RenderPlanPlaybackContext {
  passInstructionIndex: number;
  passGroupIndex: number;
  activeGroupTransform: Matrix | null;
  groupTransformDepth: number;
  /**
   * Active retained-capture recorder stack (Track B Slice 3, S3-D6),
   * innermost last. Recorders STACK: a batch flushed (or an inner set
   * replayed) inside nested recording groups is appended to every active
   * target; instance bytes are stored once, owned by the innermost group.
   */
  captureTargets: RetainedInstructionSet[];
}

/**
 * Playback hooks the backend may implement. The render-group hooks describe a
 * batch unit as the entries range `entries[startIndex, startIndex + count)` —
 * every entry in that range is a {@link RenderEntryKind.Draw}, so the backend
 * reads each command via `entries[i].command`. The plan player no longer
 * materializes a `RenderGroup[]` per scope (Slice 2c); the range carries the
 * same information allocation-free.
 *
 * Retained instruction-set hooks (Track B Slice 3): a backend that supports
 * flush-level batch recording implements all four. Contract:
 *
 * - `_beginRetainedCapture(set)` — a retained group scope starts recording.
 *   The backend MUST flush any pending renderer batch BEFORE capture starts
 *   (so no batch spans the boundary; the enclosing group-transform switch
 *   already forces this on both shipped backends) and then append one
 *   {@link RetainedBatchInstruction} to every active capture set for each
 *   renderer flush until the matching end call.
 * - `_endRetainedCapture(set)` — the scope's playback ended. The backend MUST
 *   flush its pending batch INTO the still-active captures before removing
 *   `set` from its stack (the group's trailing draws belong to the set).
 * - `_replayRetainedBatch(batch)` — replay one recorded batch: flush any
 *   pending live batch first (WebGPU: without ending the pass, S3-D7), then
 *   issue the batch from group-owned resources with all STATE resolved live
 *   (pipeline, projection/group uniforms, texture bindings) and bump stats
 *   from the descriptor.
 * - `_setRenderGroupTransform` MUST flush the pending batch while capturing
 *   (both shipped backends already treat a group as a flush boundary), so
 *   recorded batches never straddle an Enter/LeaveGroup marker.
 */
interface RenderPlanPlaybackHooks {
  _beginDrawPlan?(nodeCount: number): void;
  _beginRenderGroup?(entries: readonly ScopeEntry[], startIndex: number, count: number): void;
  _prepareRenderGroupUpload?(entries: readonly ScopeEntry[], startIndex: number, count: number, context: RenderGroupPlaybackContext): void;
  _prepareRenderInstructionSlot?(instruction: RenderInstruction, slot: RenderInstructionSlot): void;
  _prepareDrawCommand?(instruction: RenderInstruction): void;
  _endRenderGroup?(entries: readonly ScopeEntry[], startIndex: number, count: number): void;
  _endDrawPlan?(): void;
  _setRenderGroupTransform?(transform: Matrix | null): void;
  _beginRetainedCapture?(set: RetainedInstructionSet): void;
  _endRetainedCapture?(set: RetainedInstructionSet): void;
  _replayRetainedBatch?(batch: RetainedBatchInstruction): void;
}

/**
 * Length of the batch run starting at `entries[startIndex]` (which must be a
 * draw): the maximal span of consecutive draw entries sharing the same defined
 * `groupIndex`. A draw with `groupIndex === undefined` is its own singleton run
 * (it never coalesces), and any non-draw entry ends the run. This is exactly the
 * adjacency the (deleted) `collectRenderGroups` materialized, walked in place.
 */
const groupRunLength = (entries: readonly ScopeEntry[], startIndex: number): number => {
  const first = entries[startIndex];

  // Callers only enter with a draw at `startIndex`.
  const groupIndex = (first as Extract<ScopeEntry, { kind: RenderEntryKind.Draw }>).command.groupIndex;

  if (groupIndex === undefined) {
    return 1;
  }

  let count = 1;

  for (let i = startIndex + 1; i < entries.length; i++) {
    const entry = entries[i]!;

    if (entry.kind !== RenderEntryKind.Draw || entry.command.groupIndex !== groupIndex) {
      break;
    }

    count++;
  }

  return count;
};

/** @internal */
export class RenderPlanPlayer {
  /** Per-depth scratch matrices for composed group transforms (reused across frames). */
  private static readonly _groupTransformScratch: Matrix[] = [];

  public static play(plan: RenderPlan, backend: RenderBackend): void {
    const hooks = backend as RenderBackend & RenderPlanPlaybackHooks;

    hooks._beginDrawPlan?.(plan.nodeCount);

    try {
      for (const pass of plan.passes) {
        if (pass.target !== null && backend.renderTarget !== pass.target) {
          backend.setRenderTarget(pass.target);
        }

        if (backend.view !== pass.view) {
          backend.setView(pass.view);
        }

        if (pass.clearColor !== null) {
          backend.clear(pass.clearColor);
        }

        this._playScope(pass.root, backend, hooks, this._createPlaybackContext());
      }
    } finally {
      hooks._endDrawPlan?.();
    }
  }

  public static playScope(scope: RenderScope, backend: RenderBackend): void {
    const hooks = backend as RenderBackend & RenderPlanPlaybackHooks;

    this._playScope(scope, backend, hooks, this._createPlaybackContext());
  }

  private static _playScope(scope: RenderScope, backend: RenderBackend, hooks: RenderPlanPlaybackHooks, context: RenderPlanPlaybackContext): void {
    if (scope.kind === RenderEntryKind.Barrier) {
      RenderEffectExecutor.play(scope, backend, childScope => {
        this._playScope(childScope, backend, hooks, context);
      });

      return;
    }

    this._playGroup(scope, backend, hooks, context);
  }

  private static _playGroup(scope: GroupScope, backend: RenderBackend, hooks: RenderPlanPlaybackHooks, context: RenderPlanPlaybackContext): void {
    // Retained instruction splice (Slice 3, S3-D2): the collect switch left
    // this scope EMPTY and attached the recorded batch list — replay it in
    // O(batches) instead of walking entries. Truthy check: pooled scopes
    // always carry the field, but hand-built test scopes may omit it.
    if (scope.retainedInstructions) {
      this._replayRetainedInstructions(scope.retainedInstructions, hooks, context);

      return;
    }

    // Record arming (Slice 3): capture this scope's normal playback at
    // renderer-flush granularity. Skipped when the target already holds a
    // valid recording (the multi-render()/multi-play guard) or the backend
    // does not implement the capture hooks (dormant fallback). Truthy read:
    // see retainedInstructions above.
    const armed = scope.retainedRecordTarget;
    let recordTarget: RetainedInstructionSet | null = null;

    if (armed && hooks._beginRetainedCapture !== undefined && hooks._endRetainedCapture !== undefined && !armed.isValidFor(backend)) {
      recordTarget = armed;
      recordTarget.beginRecording(backend);
      context.captureTargets.push(recordTarget);
      hooks._beginRetainedCapture(recordTarget);
    }

    if (recordTarget === null) {
      this._playGroupEntries(scope, backend, hooks, context);

      return;
    }

    let failed = false;

    try {
      this._playGroupEntries(scope, backend, hooks, context);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      // The backend flushes its pending batch INTO the captures here (the
      // group's trailing draws), then the recorder leaves the stack.
      hooks._endRetainedCapture!(recordTarget);
      context.captureTargets.pop();

      if (failed) {
        recordTarget.abortRecording();
      } else {
        recordTarget.commitRecording();
      }
    }
  }

  private static _playGroupEntries(scope: GroupScope, backend: RenderBackend, hooks: RenderPlanPlaybackHooks, context: RenderPlanPlaybackContext): void {
    const entries = scope.entries;

    // Phase 1 — populate the CPU transform buffer for all groups in this scope
    // before any renderer draws execute. Without this separation, each
    // per-group upload changes the buffer hash while a renderer holds an
    // in-flight batch; the next flush detects the changed hash and re-uploads
    // the growing buffer, producing O(groups²) GPU transform writes per pass
    // (measured: ~240 KB/frame for 100 NineSlice sprites across 8 textures,
    // ~600 MB/frame for 5000 RepeatingSprites). Writing every group's
    // transforms first ensures the hash is stable by the time the first flush
    // calls bindTransformBufferTexture/getTransformStorageBuffer, so all
    // subsequent flushes within the same scope find an unchanged hash and skip
    // the upload entirely.
    //
    // The pre-pass walks `groupIndex` adjacency directly over `entries` — the
    // same runs the (deleted) `collectRenderGroups` produced, in the same order
    // — so no `RenderGroup[]`/`instructions[]` is materialized per scope/frame.
    if (hooks._prepareRenderGroupUpload !== undefined) {
      let preInstructionIndex = context.passInstructionIndex;
      let groupOrdinal = 0;

      for (let i = 0; i < entries.length; ) {
        if (entries[i]!.kind !== RenderEntryKind.Draw) {
          i++;

          continue;
        }

        const count = groupRunLength(entries, i);

        hooks._prepareRenderGroupUpload(
          entries,
          i,
          count,
          this._createRenderGroupPlaybackContext(count, preInstructionIndex, context.passGroupIndex + groupOrdinal),
        );
        preInstructionIndex += count;
        groupOrdinal++;
        i += count;
      }
    }

    // Phase 2 — execute draws in document order. Transform writes are already
    // done; _prepareRenderGroupUpload is intentionally not called a second time.
    // Group boundaries are the same `groupIndex` adjacency Phase 1 walked.
    let groupStart = -1;
    let groupCount = 0;
    let currentInstructionIndex = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;

      if (entry.kind === RenderEntryKind.Draw) {
        if (groupStart === -1) {
          groupStart = i;
          groupCount = groupRunLength(entries, i);
          currentInstructionIndex = 0;

          hooks._beginRenderGroup?.(entries, groupStart, groupCount);
          context.passGroupIndex++;
        }

        // Allocate the per-draw instruction slot only when a backend consumes
        // it. No shipped backend implements `_prepareRenderInstructionSlot`, so
        // skipping the `Object.freeze` slot allocation removes per-draw garbage
        // from the playback hot path while preserving the extension point.
        if (hooks._prepareRenderInstructionSlot !== undefined) {
          const slot = this._createRenderInstructionSlot(currentInstructionIndex, context.passInstructionIndex);

          hooks._prepareRenderInstructionSlot(entry.command, slot);
        }

        hooks._prepareDrawCommand?.(entry.command);
        backend.draw(entry.command.drawable);

        currentInstructionIndex++;
        context.passInstructionIndex++;

        if (currentInstructionIndex === groupCount) {
          hooks._endRenderGroup?.(entries, groupStart, groupCount);
          groupStart = -1;
          groupCount = 0;
          currentInstructionIndex = 0;
        }
      } else if (entry.kind === RenderEntryKind.Group) {
        const transformNode = entry.scope.transformNode;

        if (transformNode !== null && hooks._setRenderGroupTransform !== undefined) {
          const outer = context.activeGroupTransform;
          const scratch = (RenderPlanPlayer._groupTransformScratch[context.groupTransformDepth] ??= new Matrix());

          // The boundary node's global transform is relative to the nearest
          // ENCLOSING group (identity-parent convention, spec §5), so nested
          // retained groups compose onto the outer group's world matrix.
          scratch.copy(transformNode.getGlobalTransform());

          if (outer !== null) {
            scratch.combine(outer);
          }

          context.groupTransformDepth++;
          context.activeGroupTransform = scratch;
          hooks._setRenderGroupTransform(scratch);

          // Group-transform markers (Slice 3, S3-D6): active recorders learn
          // the nested boundary as a LIVE node reference — never a captured
          // matrix — so replay composes the group matrix of the day. The
          // transform switch above already flushed the pending batch into the
          // recorders (hook contract), so no batch straddles the marker.
          if (context.captureTargets.length > 0) {
            this._appendToCaptures(context, { kind: RetainedInstructionKind.EnterGroup, node: transformNode });
          }

          try {
            this._playGroup(entry.scope, backend, hooks, context);
          } finally {
            context.groupTransformDepth--;
            context.activeGroupTransform = outer;
            hooks._setRenderGroupTransform(outer);

            if (context.captureTargets.length > 0) {
              this._appendToCaptures(context, retainedLeaveGroupInstruction);
            }
          }
        } else {
          this._playGroup(entry.scope, backend, hooks, context);
        }
      } else {
        // Barrier subtrees collect in world space (a barrier-bearing child
        // escapes the group-relative convention, plan D-P4), so their playback
        // must not apply the group uniform.
        const suspended = context.activeGroupTransform;

        if (suspended !== null) {
          context.activeGroupTransform = null;
          hooks._setRenderGroupTransform?.(null);
        }

        try {
          RenderEffectExecutor.play(entry.scope, backend, childScope => {
            this._playScope(childScope, backend, hooks, context);
          });
        } finally {
          if (suspended !== null) {
            context.activeGroupTransform = suspended;
            hooks._setRenderGroupTransform?.(suspended);
          }
        }
      }
    }
  }

  /**
   * Replay a recorded instruction set for a spliced group scope (Slice 3,
   * S3-D1/S3-D2): O(batches) backend dispatches. Group markers re-compose the
   * LIVE nested-boundary matrices through the same scratch logic the entry
   * path uses (camera pan and group moves stay one-matrix-cheap); batches go
   * to the backend's `_replayRetainedBatch` hook, which resolves all STATE
   * (pipeline, projection/group uniforms, textures) live and reuses only the
   * recorded DATA. While an OUTER group records, every replayed instruction
   * is appended to the active recorders verbatim — same descriptors, same
   * buffers (S3-D6).
   */
  private static _replayRetainedInstructions(set: RetainedInstructionSet, hooks: RenderPlanPlaybackHooks, context: RenderPlanPlaybackContext): void {
    const instructions = set.instructions;
    const capturing = context.captureTargets.length > 0;
    // Restore stack for Enter/LeaveGroup markers (balanced by construction —
    // the recorder appends them in matched pairs). Shared scratch, non-
    // reentrant: replayed sets are flat (no nested _playGroup below them).
    const outerStack = RenderPlanPlayer._replayOuterStack;
    const outerBase = outerStack.length;

    try {
      for (let i = 0; i < instructions.length; i++) {
        // In-bounds: i < length.
        const instruction = instructions[i]!;

        if (capturing) {
          this._appendToCaptures(context, instruction);
        }

        if (instruction.kind === RetainedInstructionKind.Batch) {
          hooks._replayRetainedBatch?.(instruction);
        } else if (instruction.kind === RetainedInstructionKind.EnterGroup) {
          const outer = context.activeGroupTransform;
          const scratch = (RenderPlanPlayer._groupTransformScratch[context.groupTransformDepth] ??= new Matrix());

          scratch.copy(instruction.node.getGlobalTransform());

          if (outer !== null) {
            scratch.combine(outer);
          }

          outerStack.push(outer);
          context.groupTransformDepth++;
          context.activeGroupTransform = scratch;
          hooks._setRenderGroupTransform?.(scratch);
        } else if (outerStack.length > outerBase) {
          const outer = outerStack.pop() ?? null;

          context.groupTransformDepth--;
          context.activeGroupTransform = outer;
          hooks._setRenderGroupTransform?.(outer);
        }
      }
    } finally {
      // Unwind any unbalanced markers (only reachable on a mid-replay throw).
      while (outerStack.length > outerBase) {
        const outer = outerStack.pop() ?? null;

        context.groupTransformDepth--;
        context.activeGroupTransform = outer;
        hooks._setRenderGroupTransform?.(outer);
      }
    }
  }

  private static _appendToCaptures(context: RenderPlanPlaybackContext, instruction: RetainedInstruction): void {
    const targets = context.captureTargets;

    for (let i = 0; i < targets.length; i++) {
      // In-bounds: i < length.
      targets[i]!.append(instruction);
    }
  }

  /** Shared marker-restore scratch for {@link _replayRetainedInstructions}. */
  private static readonly _replayOuterStack: Array<Matrix | null> = [];

  private static _createPlaybackContext(): RenderPlanPlaybackContext {
    return {
      passInstructionIndex: 0,
      passGroupIndex: 0,
      activeGroupTransform: null,
      groupTransformDepth: 0,
      captureTargets: [],
    };
  }

  private static _createRenderGroupPlaybackContext(
    groupInstructionCount: number,
    firstPassInstructionIndex: number,
    passGroupIndex: number,
  ): RenderGroupPlaybackContext {
    return Object.freeze({
      groupInstructionCount,
      firstPassInstructionIndex,
      lastPassInstructionIndex: firstPassInstructionIndex + groupInstructionCount - 1,
      passGroupIndex,
    });
  }

  private static _createRenderInstructionSlot(groupInstructionIndex: number, passInstructionIndex: number): RenderInstructionSlot {
    return Object.freeze({
      groupInstructionIndex,
      passInstructionIndex,
    });
  }
}
