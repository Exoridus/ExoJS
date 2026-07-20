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

/**
 * Handle returned by {@link SceneInteraction.capture}. While active, pointer
 * hit-testing is confined to the captured root's subtree. Call
 * {@link InteractionCapture.release} (or {@link InteractionCapture.destroy},
 * an alias) to end the capture — nested captures restore whichever capture
 * was active before this one, regardless of release order. Idempotent; also
 * released automatically when the owning scene ends permanently.
 */
export interface InteractionCapture extends Destroyable {
  /** `true` until this capture is released. */
  readonly active: boolean;
  /** End this capture. Idempotent alias for {@link InteractionCapture.destroy}. */
  release(): void;
}

interface TrackedObservation extends InteractionObservation {
  readonly root: RenderNode;
  released: boolean;
}

interface TrackedCapture extends InteractionCapture {
  readonly root: RenderNode;
  released: boolean;
}

/**
 * Scene-bound interaction facade. `scene.root` and a materialized `scene.ui`
 * are attached automatically at activation and detached at teardown — that
 * automatic wiring lives in the internal `SceneScope`, not here.
 * {@link SceneInteraction.observe} is the *explicit* path for additional
 * roots (e.g. a subtree rendered outside `scene.root`); {@link
 * SceneInteraction.capture} confines hit-testing to one subtree (modal
 * dialogs, pause menus). Access via {@link Scene.interaction}.
 *
 * Delegates entirely to `app.interaction` — no second picking/dispatch
 * engine, just tracking of what this facade attached/pushed so it can
 * detach/release on teardown. Pause-aware dispatch gating (state
 * Active/Paused, transition gate) is enforced once, centrally, in
 * {@link InteractionManager.update} — not duplicated here.
 */
export class SceneInteraction implements Destroyable {
  private readonly _observations = new Set<TrackedObservation>();
  private readonly _captures: TrackedCapture[] = [];

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
   * Confine pointer hit-testing to `root`'s subtree until the returned
   * handle is released — a modal dialog, pause menu, or full-screen overlay
   * that must swallow clicks outside itself. Nested captures use
   * last-created priority; releasing any capture (not only the most recent)
   * restores the stack to its state as if that capture had never been
   * created, preserving the relative order of the rest.
   */
  public capture(root: RenderNode): InteractionCapture {
    this._app.interaction.pushInputCapture(root);

    const capture: TrackedCapture = {
      root,
      released: false,
      release: () => this._releaseCapture(capture),
      destroy: () => this._releaseCapture(capture),
      get active(): boolean {
        return !this.released;
      },
    };

    this._captures.push(capture);

    return capture;
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

    for (const capture of [...this._captures].reverse()) {
      this._releaseCapture(capture);
    }
  }

  private _release(observation: TrackedObservation): void {
    if (observation.released) {
      return;
    }

    observation.released = true;
    this._observations.delete(observation);
    this._app.interaction.detachRoot(observation.root);
  }

  private _releaseCapture(capture: TrackedCapture): void {
    if (capture.released) {
      return;
    }

    const index = this._captures.indexOf(capture);

    // Pop every still-active capture from the top down through (and
    // including) this one, then re-push everything that was above it, in
    // original order — restores the manager's stack as if `capture` had
    // never existed, without needing a manager-level "remove at index" API.
    const above = this._captures.slice(index + 1);

    for (let i = this._captures.length - 1; i >= index; i--) {
      this._app.interaction.popInputCapture();
    }

    capture.released = true;
    this._captures.splice(index, 1);

    for (const entry of above) {
      this._app.interaction.pushInputCapture(entry.root);
    }
  }
}
