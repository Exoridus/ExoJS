import type { Application } from '#core/Application';
import type { Destroyable } from '#core/types';
import type { RenderNode } from '#rendering/RenderNode';

/**
 * Handle returned by {@link SceneInteraction.observe}. Detaches the observed
 * root from interaction dispatch — call {@link InteractionObservation.release}
 * (or {@link InteractionObservation.destroy}, an alias) when the root no
 * longer needs pointer/focus routing. Idempotent; also released automatically
 * when the owning scene ends permanently.
 */
export interface InteractionObservation extends Destroyable {
  /** Detach the observed root. Idempotent alias for {@link InteractionObservation.destroy}. */
  release(): void;
}

interface TrackedObservation extends InteractionObservation {
  readonly root: RenderNode;
  released: boolean;
}

/**
 * Scene-bound interaction facade. `scene.root` and a materialized `scene.ui`
 * are attached automatically at activation and detached at teardown — that
 * automatic wiring lives in the internal `SceneScope`, not here.
 * {@link SceneInteraction.observe} is the *explicit* path for additional
 * roots (e.g. a subtree rendered outside `scene.root`). Access via
 * {@link Scene.interaction}.
 *
 * Delegates entirely to `app.interaction` — no second picking/dispatch
 * engine, just tracking of what this facade attached so it can detach on
 * teardown. Modal capture (`capture()`) and pause-aware dispatch gating are
 * introduced by a later slice.
 */
export class SceneInteraction implements Destroyable {
  private readonly _observations = new Set<TrackedObservation>();

  public constructor(private readonly _app: Application) {}

  /**
   * Attach `root` to interaction dispatch (pointer/focus routing), so its
   * interactive descendants start receiving events. Returns a handle to
   * detach it early; otherwise it is detached automatically when the scene
   * ends permanently.
   */
  public observe(root: RenderNode): InteractionObservation {
    this._app.interaction.attachRoot(root);

    const observation: TrackedObservation = {
      root,
      released: false,
      release: () => this._release(observation),
      destroy: () => this._release(observation),
    };

    this._observations.add(observation);

    return observation;
  }

  /**
   * Disable every tracked observation without detaching it. Reserved for
   * retention (suspend/resume) — a later slice wires this to actual
   * suspend/restore transitions.
   * @internal
   */
  public suspend(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  /** Restore normal dispatch after {@link SceneInteraction.suspend}. @internal */
  public resume(): void {
    // Wired by a later slice alongside retained-scene suspension.
  }

  public destroy(): void {
    for (const observation of [...this._observations]) {
      this._release(observation);
    }

    this._observations.clear();
  }

  private _release(observation: TrackedObservation): void {
    if (observation.released) {
      return;
    }

    observation.released = true;
    this._observations.delete(observation);
    this._app.interaction.detachRoot(observation.root);
  }
}
