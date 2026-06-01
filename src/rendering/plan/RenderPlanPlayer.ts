import type { RenderBackend } from '@/rendering/RenderBackend';

import { RenderEntryKind } from './RenderCommand';
import { RenderEffectExecutor } from './RenderEffectExecutor';
import { collectRenderGroups, type RenderGroup, type RenderInstruction } from './RenderInstruction';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope, RenderScope } from './RenderScope';

interface RenderPlanPlaybackHooks {
  _beginDrawPlan?(nodeCount: number): void;
  _beginRenderGroup?(group: RenderGroup): void;
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

        this.playScope(pass.root, backend);
      }
    } finally {
      hooks._endDrawPlan?.();
    }
  }

  public static playScope(scope: RenderScope, backend: RenderBackend): void {
    if (scope.kind === RenderEntryKind.Barrier) {
      RenderEffectExecutor.play(scope, backend, childScope => {
        this.playScope(childScope, backend);
      });

      return;
    }

    this._playGroup(scope, backend);
  }

  private static _playGroup(scope: GroupScope, backend: RenderBackend): void {
    const hooks = backend as RenderBackend & RenderPlanPlaybackHooks;
    const groups = collectRenderGroups(scope);
    let groupCursor = 0;
    let currentGroup: RenderGroup | null = null;
    let currentInstructionIndex = 0;

    for (const entry of scope.entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        if (currentGroup === null) {
          currentGroup = groups[groupCursor];
          currentInstructionIndex = 0;
          hooks._beginRenderGroup?.(currentGroup);
        }

        hooks._prepareDrawCommand?.(entry.command);
        backend.draw(entry.command.drawable);

        currentInstructionIndex++;

        if (currentGroup !== null && currentInstructionIndex === currentGroup.instructions.length) {
          hooks._endRenderGroup?.(currentGroup);
          currentGroup = null;
          currentInstructionIndex = 0;
          groupCursor++;
        }
      } else if (entry.kind === RenderEntryKind.Group) {
        this._playGroup(entry.scope, backend);
      } else {
        RenderEffectExecutor.play(entry.scope, backend, childScope => {
          this.playScope(childScope, backend);
        });
      }
    }
  }
}
