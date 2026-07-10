import { Matrix } from '#math/Matrix';
import type { RenderBackend } from '#rendering/RenderBackend';

import { RenderEntryKind } from './RenderCommand';
import { RenderEffectExecutor } from './RenderEffectExecutor';
import type { RenderInstruction } from './RenderInstruction';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope, RenderScope, ScopeEntry } from './RenderScope';

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
}

/**
 * Playback hooks the backend may implement. The render-group hooks describe a
 * batch unit as the entries range `entries[startIndex, startIndex + count)` —
 * every entry in that range is a {@link RenderEntryKind.Draw}, so the backend
 * reads each command via `entries[i].command`. The plan player no longer
 * materializes a `RenderGroup[]` per scope (Slice 2c); the range carries the
 * same information allocation-free.
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

          try {
            this._playGroup(entry.scope, backend, hooks, context);
          } finally {
            context.groupTransformDepth--;
            context.activeGroupTransform = outer;
            hooks._setRenderGroupTransform(outer);
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

  private static _createPlaybackContext(): RenderPlanPlaybackContext {
    return {
      passInstructionIndex: 0,
      passGroupIndex: 0,
      activeGroupTransform: null,
      groupTransformDepth: 0,
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
