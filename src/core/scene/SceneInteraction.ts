import type { Application } from '#core/Application';
import { SceneState } from '#core/SceneState';
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
  /** Whether this observation currently reached `app.interaction` — false while created/left dormant. */
  attached: boolean;
  released: boolean;
}

interface TrackedCapture extends InteractionCapture {
  readonly root: RenderNode;
  /** Whether this capture is currently pushed onto `app.interaction`'s stack — false while created/left dormant. */
  attached: boolean;
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
 *
 * While the owning scope is not `Active` (`Preparing`, `Ready`, or
 * `Suspended`), `observe()`/`capture()` track their registration locally but
 * never reach `app.interaction` — including a call made while already
 * `Suspended` (definition §4.2). {@link SceneInteraction.resume} attaches
 * everything not yet attached, in tracking order, on the next transition
 * into `Active` (fresh activation or retention restore alike).
 */
export class SceneInteraction implements Destroyable {
  private readonly _observations = new Set<TrackedObservation>();
  private readonly _captures: TrackedCapture[] = [];

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
  ) {}

  private _isLive(): boolean {
    return this._getState() === SceneState.Active;
  }

  /**
   * Attach `root` to interaction dispatch (pointer/focus routing), so its
   * interactive descendants start receiving events — immediately if the
   * owning scope is currently `Active`, otherwise buffered until it next
   * becomes `Active` (see the class doc). Returns a handle to detach it
   * early; otherwise it is detached automatically when the scene ends
   * permanently.
   */
  public observe(root: RenderNode): InteractionObservation {
    const live = this._isLive();

    if (live) {
      this._app.interaction.attachRoot(root);
    }

    const observation: TrackedObservation = {
      root,
      attached: live,
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
   * created, preserving the relative order of the rest. Buffered until the
   * owning scope is `Active`, same as {@link SceneInteraction.observe}.
   */
  public capture(root: RenderNode): InteractionCapture {
    const live = this._isLive();

    if (live) {
      this._app.interaction.pushInputCapture(root);
    }

    const capture: TrackedCapture = {
      root,
      attached: live,
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
   * Detach every currently-attached observation and pop every
   * currently-attached capture off the manager's stack, without discarding
   * local tracking — so {@link SceneInteraction.resume} can reattach exactly
   * the same set in the same order. A retained scene must not keep
   * receiving pointer dispatch alongside whichever scope is now active
   * (definition §4.2). A no-op for anything created while already dormant
   * (never reached `app.interaction` in the first place). Idempotent.
   * @internal
   */
  public suspend(): void {
    for (const observation of this._observations) {
      if (observation.attached) {
        this._app.interaction.detachRoot(observation.root);
        observation.attached = false;
      }
    }

    for (let i = this._captures.length - 1; i >= 0; i--) {
      const capture = this._captures[i]!;

      if (capture.attached) {
        this._app.interaction.popInputCapture();
        capture.attached = false;
      }
    }
  }

  /**
   * Attach every observation and push every capture not currently attached
   * to `app.interaction`, in tracking order — covers both a fresh
   * activation flushing whatever was registered while dormant, and a
   * retention restore reinstating whatever {@link SceneInteraction.suspend}
   * detached. Idempotent — already-attached entries are left alone.
   * @internal
   */
  public resume(): void {
    for (const observation of this._observations) {
      if (!observation.attached) {
        this._app.interaction.attachRoot(observation.root);
        observation.attached = true;
      }
    }

    for (const capture of this._captures) {
      if (!capture.attached) {
        this._app.interaction.pushInputCapture(capture.root);
        capture.attached = true;
      }
    }
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

    if (observation.attached) {
      this._app.interaction.detachRoot(observation.root);
    }
  }

  private _releaseCapture(capture: TrackedCapture): void {
    if (capture.released) {
      return;
    }

    const index = this._captures.indexOf(capture);

    if (!capture.attached) {
      // Never reached app.interaction (created while dormant, or currently
      // detached by suspend()) — local bookkeeping only; the manager's
      // stack was never touched for this capture in the first place.
      capture.released = true;
      this._captures.splice(index, 1);

      return;
    }

    // Every capture from `index` onward is attached together in practice —
    // captures only ever attach while genuinely Active, and suspend()
    // detaches the entire array together, so a mix of attached/unattached
    // entries above an attached one cannot arise. Pop every capture from
    // the top down through (and including) this one, then re-push
    // everything that was above it, in original order — restores the
    // manager's stack as if `capture` had never existed.
    const above = this._captures.slice(index + 1);

    for (let i = this._captures.length - 1; i >= index; i--) {
      this._app.interaction.popInputCapture();
      this._captures[i]!.attached = false;
    }

    capture.released = true;
    this._captures.splice(index, 1);

    for (const entry of above) {
      this._app.interaction.pushInputCapture(entry.root);
      entry.attached = true;
    }
  }
}
