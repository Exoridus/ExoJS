import type { RenderBackend } from '@/rendering/RenderBackend';

import type { DrawCommand } from './RenderCommand';
import { RenderEntryKind } from './RenderCommand';
import { RenderEffectExecutor } from './RenderEffectExecutor';
import type { RenderPlan } from './RenderPlan';
import type { GroupScope, RenderScope } from './RenderScope';

interface RenderPlanPlaybackHooks {
  _beginDrawPlan?(nodeCount: number): void;
  _prepareDrawCommand?(command: DrawCommand): void;
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

    for (const entry of scope.entries) {
      if (entry.kind === RenderEntryKind.Draw) {
        hooks._prepareDrawCommand?.(entry.command);
        backend.draw(entry.command.drawable);
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
