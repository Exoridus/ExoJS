import type { RenderBackend } from '#rendering/RenderBackend';

import { RenderEntryKind } from './RenderCommand';
import { RenderEffectExecutor } from './RenderEffectExecutor';
import { collectRenderGroups, type RenderGroup, type RenderInstruction } from './RenderInstruction';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope, RenderScope } from './RenderScope';

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
}

interface RenderPlanPlaybackHooks {
  _beginDrawPlan?(nodeCount: number): void;
  _beginRenderGroup?(group: RenderGroup): void;
  _prepareRenderGroupUpload?(group: RenderGroup, context: RenderGroupPlaybackContext): void;
  _prepareRenderInstructionSlot?(instruction: RenderInstruction, slot: RenderInstructionSlot): void;
  _prepareDrawCommand?(instruction: RenderInstruction): void;
  _endRenderGroup?(group: RenderGroup): void;
  _endDrawPlan?(): void;
}

/** @internal */
export class RenderPlanPlayer {
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
    const groups = collectRenderGroups(scope);
    let groupCursor = 0;
    let currentGroup: RenderGroup | null = null;
    let currentInstructionIndex = 0;

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
    if (hooks._prepareRenderGroupUpload !== undefined) {
      let preInstructionIndex = context.passInstructionIndex;

      for (let gi = 0; gi < groups.length; gi++) {
        // In-bounds: gi < groups.length.
        const group = groups[gi]!;

        hooks._prepareRenderGroupUpload(
          group,
          this._createRenderGroupPlaybackContext(group.instructions.length, preInstructionIndex, context.passGroupIndex + gi),
        );
        preInstructionIndex += group.instructions.length;
      }
    }

    // Phase 2 — execute draws in document order. Transform writes are already
    // done; _prepareRenderGroupUpload is intentionally not called a second time.
    for (const entry of scope.entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        if (currentGroup === null) {
          // Invariant: collectRenderGroups yields groups whose total instruction
          // count equals the draw-entry count, and groupCursor only advances when
          // a group is fully consumed, so a group exists for every draw entry.
          currentGroup = groups[groupCursor]!;
          currentInstructionIndex = 0;

          hooks._beginRenderGroup?.(currentGroup);
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

        if (currentGroup !== null && currentInstructionIndex === currentGroup.instructions.length) {
          hooks._endRenderGroup?.(currentGroup);
          currentGroup = null;
          currentInstructionIndex = 0;
          groupCursor++;
        }
      } else if (entry.kind === RenderEntryKind.Group) {
        this._playGroup(entry.scope, backend, hooks, context);
      } else {
        RenderEffectExecutor.play(entry.scope, backend, childScope => {
          this._playScope(childScope, backend, hooks, context);
        });
      }
    }
  }

  private static _createPlaybackContext(): RenderPlanPlaybackContext {
    return {
      passInstructionIndex: 0,
      passGroupIndex: 0,
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
