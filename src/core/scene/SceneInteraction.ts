import type { Application } from '#core/Application';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { SceneState } from '#core/scene/SceneState';
import type { Destroyable } from '#core/types';
import type { ScopeToken } from '#input/ScopeToken';
import type { RenderNode } from '#rendering/RenderNode';

/** Options for {@link SceneInteraction.observe} and {@link SceneInteraction.scope}. */
export interface SceneInteractionOptions {
  /**
   * When the registration takes part in dispatch: `'always'` (the default)
   * keeps it live through {@link SceneDirector.pause}, so a pause menu drawn by
   * the paused scene still receives pointer events; `'active'` detaches it
   * while the scene is paused; `'paused'` attaches it only then.
   */
  readonly when?: SceneAvailability;
}

/**
 * Handle returned by {@link SceneInteraction.observe}. Detaches the observed
 * root from interaction dispatch - call {@link InteractionObservation.release}
 * (or {@link InteractionObservation.destroy}, an alias) when the root no
 * longer needs pointer/focus routing. Idempotent; also released automatically
 * when the owning scene ends permanently.
 */
export interface InteractionObservation extends Destroyable {
  /** Detach the observed root. Idempotent alias for {@link InteractionObservation.destroy}. */
  release(): void;
}

/**
 * Handle returned by {@link SceneInteraction.scope}. While active, pointer
 * hit-testing and Tab traversal are confined to the scoped root's subtree.
 * Call {@link InteractionScope.release} (or {@link InteractionScope.destroy},
 * an alias) to end the scope - nested scopes restore whichever scope was
 * active before this one, regardless of release order. Idempotent; also
 * released automatically when the owning scene ends permanently.
 */
export interface InteractionScope extends Destroyable {
  /** `true` until this scope is released. */
  readonly active: boolean;
  /** End this scope. Idempotent alias for {@link InteractionScope.destroy}. */
  release(): void;
}

interface TrackedObservation extends InteractionObservation {
  readonly when: SceneAvailability;
  readonly root: RenderNode;
  /** Whether this observation currently reached `app.interaction` - false while created/left dormant. */
  attached: boolean;
  released: boolean;
}

interface TrackedScope extends InteractionScope {
  readonly when: SceneAvailability;
  readonly root: RenderNode;
  /** The live scope's token while pushed onto `app.interaction`'s stack, `null` while created/left dormant. */
  token: ScopeToken | null;
  released: boolean;
}

/**
 * Scene-bound interaction facade. `scene.root` and a materialized `scene.ui`
 * are attached automatically at activation and detached at teardown - that
 * automatic wiring lives in the internal `SceneScope`, not here.
 * {@link SceneInteraction.observe} is the *explicit* path for additional
 * roots (e.g. a subtree rendered outside `scene.root`); {@link
 * SceneInteraction.scope} confines hit-testing and Tab traversal to one subtree (modal
 * dialogs, pause menus). Access via {@link Scene.interaction}.
 *
 * Delegates entirely to `app.interaction` - no second picking/dispatch
 * engine, just tracking of what this facade attached/pushed so it can
 * detach/release on teardown. Pause-aware dispatch gating (state
 * Active/Paused, transition gate) is enforced once, centrally, in
 * {@link InteractionSystem.update} - not duplicated here.
 *
 * While the owning scope is not `Active` (`Preparing`, `Ready`, or
 * `Suspended`), `observe()`/`scope()` track their registration locally but
 * never reach `app.interaction` - including a call made while already
 * `Suspended`. {@link SceneInteraction.resume} attaches
 * everything not yet attached, in tracking order, on the next transition
 * into `Active` (fresh activation or retention restore alike).
 */
export class SceneInteraction implements Destroyable {
  private readonly _observations = new Set<TrackedObservation>();
  private readonly _scopes: TrackedScope[] = [];

  public constructor(
    private readonly _app: Application,
    private readonly _getState: () => SceneState,
    private readonly _getPaused: () => boolean = () => false,
  ) {}

  private _isLive(): boolean {
    return this._getState() === SceneState.Active;
  }

  /** Whether a registration with policy `when` belongs in dispatch right now. */
  private _allows(when: SceneAvailability): boolean {
    if (!this._isLive()) {
      return false;
    }

    if (when === SceneAvailability.Always) {
      return true;
    }

    return when === SceneAvailability.Active ? !this._getPaused() : this._getPaused();
  }

  /**
   * Attach `root` to interaction dispatch (pointer/focus routing), so its
   * interactive descendants start receiving events - immediately if the
   * owning scope is currently `Active`, otherwise buffered until it next
   * becomes `Active` (see the class doc). Returns a handle to detach it
   * early; otherwise it is detached automatically when the scene ends
   * permanently.
   */
  public observe(root: RenderNode, options: SceneInteractionOptions = {}): InteractionObservation {
    const when = options.when ?? SceneAvailability.Always;
    const live = this._allows(when);

    if (live) {
      this._app.interaction.attachRoot(root);
    }

    const observation: TrackedObservation = {
      root,
      when,
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
   * handle is released - a modal dialog, pause menu, or full-screen overlay
   * that must swallow clicks outside itself. Nested scopes use
   * last-created priority; releasing any scope (not only the most recent)
   * restores the stack to its state as if that scope had never been
   * created, preserving the relative order of the rest. Buffered until the
   * owning scope is `Active`, same as {@link SceneInteraction.observe}.
   */
  public scope(root: RenderNode, options: SceneInteractionOptions = {}): InteractionScope {
    const when = options.when ?? SceneAvailability.Always;
    const token = this._allows(when) ? this._app.interaction.pushScope(root) : null;

    const scope: TrackedScope = {
      root,
      when,
      token,
      released: false,
      release: () => this._releaseScope(scope),
      destroy: () => this._releaseScope(scope),
      get active(): boolean {
        return !this.released;
      },
    };

    this._scopes.push(scope);

    return scope;
  }

  /**
   * Detach every currently-attached observation and pop every
   * currently-attached scope off the system's stack, without discarding
   * local tracking - so {@link SceneInteraction.resume} can reattach exactly
   * the same set in the same order. A retained scene must not keep
   * receiving pointer dispatch alongside whichever scope is now active.
   * A no-op for anything created while already dormant
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

    for (const scope of this._scopes) {
      if (scope.token !== null) {
        // A targeted release - InteractionSystem.popScope finds this exact
        // entry by its token wherever it sits, so entries can be released in
        // ANY order here without disturbing the others; no rebuild needed.
        this._app.interaction.popScope(scope.token);
        scope.token = null;
      }
    }
  }

  /**
   * Bring every registration in line with its `when` policy and the scope's
   * state: attach observations and push scopes that belong in dispatch now,
   * detach and pop the ones that no longer do, in tracking order. Covers a
   * fresh activation flushing whatever was registered while dormant, a
   * retention restore reinstating whatever {@link SceneInteraction.suspend}
   * detached, and a pause or resume flipping the `'active'`/`'paused'`
   * registrations. Idempotent.
   * @internal
   */
  public resume(): void {
    for (const observation of this._observations) {
      const wanted = this._allows(observation.when);

      if (wanted && !observation.attached) {
        this._app.interaction.attachRoot(observation.root);
        observation.attached = true;
      } else if (!wanted && observation.attached) {
        this._app.interaction.detachRoot(observation.root);
        observation.attached = false;
      }
    }

    for (const scope of this._scopes) {
      const wanted = this._allows(scope.when);

      if (wanted && scope.token === null) {
        scope.token = this._app.interaction.pushScope(scope.root);
      } else if (!wanted && scope.token !== null) {
        this._app.interaction.popScope(scope.token);
        scope.token = null;
      }
    }
  }

  public destroy(): void {
    for (const observation of [...this._observations]) {
      this._release(observation);
    }

    this._observations.clear();

    for (const scope of [...this._scopes]) {
      this._releaseScope(scope);
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

  /**
   * Release `scope`, wherever it sits in tracking order - released in ANY
   * order relative to its siblings, since {@link InteractionSystem.popScope}
   * removes exactly this scope's own token, never anything above or below it.
   */
  private _releaseScope(scope: TrackedScope): void {
    if (scope.released) {
      return;
    }

    scope.released = true;
    this._scopes.splice(this._scopes.indexOf(scope), 1);

    if (scope.token !== null) {
      this._app.interaction.popScope(scope.token);
      scope.token = null;
    }
  }
}
