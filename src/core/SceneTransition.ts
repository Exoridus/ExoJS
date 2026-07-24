import type { RenderingContext } from '#rendering/RenderingContext';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import type { Time } from './Time';

/**
 * What kind of navigation a {@link SceneTransitionSession} is running for.
 * Read via {@link SceneTransitionContext.operation}.
 */
export type SceneTransitionOperation = 'change' | 'restore' | 'unload';

/**
 * Immutable, read-only description of the navigation a {@link SceneTransition}
 * is being asked to run for — passed to {@link SceneTransition.getRequirements}
 * and into the {@link SceneTransitionEnvironment} handed to
 * {@link SceneTransition.beginSession}. Never mutates over a session's
 * lifetime; construct a fresh one per navigation.
 */
export interface SceneTransitionContext {
  readonly operation: SceneTransitionOperation;
  /** `true` when a scene was active before this navigation began. */
  readonly hasOutgoingScene: boolean;
  /** `true` when this navigation activates a scene (`false` only for `unload()`'s active-scope discard, which has no incoming scene). */
  readonly hasIncomingScene: boolean;
}

/**
 * Render resources a {@link SceneTransitionSession} needs, declared once
 * up front via {@link SceneTransition.getRequirements} so the Director can
 * provision them before the session's first frame.
 */
export interface SceneTransitionRequirements {
  /** A one-time snapshot of the outgoing scene's render surface, captured once before the session starts. `'none'` (the common case) requests nothing. */
  readonly outgoingFrame: 'none' | 'snapshot';
  /** `'direct'`: the live surface draws straight to the screen, no texture. `'texture'`: the live surface renders into a pooled offscreen texture every frame instead. `'none'`: no live-surface resource at all. */
  readonly currentFrame: 'none' | 'direct' | 'texture';
}

/**
 * Handed to {@link SceneTransition.beginSession}. `commitRequested`/`committed`
 * are live views — they reflect state at read time, not a snapshot taken when
 * this object was constructed.
 */
export interface SceneTransitionEnvironment {
  readonly context: SceneTransitionContext;
  /** `true` once {@link SceneTransitionEnvironment.commit} has been called. Live view. */
  readonly commitRequested: boolean;
  /** `true` once the atomic commit boundary has actually been crossed. Live view. */
  readonly committed: boolean;
  /**
   * Request the scene switch. May be called synchronously from
   * `createSession()`, `update()`, or `render()`. Exactly once per session —
   * a second call is a dev-mode lifecycle error ({@link SceneTransitionLifecycleError},
   * reason `'commit-reentrant'`) and a production no-op. Never swaps the
   * active scene reentrantly from inside the caller's own callback — the
   * Director processes the actual switch only after the current callback
   * has fully returned control (§3.5.2).
   */
  commit(): void;
}

/**
 * Per-frame render inputs handed to {@link SceneTransitionSession.render}.
 * See `SceneTransitionFrame field semantics` in the design spec (§3.7a) for
 * the exact non-null conditions of each field.
 */
export interface SceneTransitionFrame {
  /** Non-null only when `outgoingFrame: 'snapshot'` was requested and an outgoing scene existed. The same texture for the entire session — never reallocated mid-session. Borrowed — do not retain or destroy it. */
  readonly outgoing: RenderTexture | null;
  /** Non-null only when `currentFrame: 'texture'` was requested and there is a live surface to show. Before commit: the outgoing scene. After commit: the incoming scene, or `null` for an unload with no incoming scene. */
  readonly current: RenderTexture | null;
  /** Mirrors {@link SceneTransitionEnvironment.committed} at render time. */
  readonly committed: boolean;
}

/**
 * One navigation's worth of mutable transition state — created fresh per
 * navigation by {@link SceneTransition.beginSession}, driven by the Director
 * until {@link SceneTransitionSession.done}, then destroyed. Never reused
 * across navigations.
 */
export interface SceneTransitionSession {
  /** Advance time-based progress. Called once per frame. */
  update(delta: Time): void;
  /** Draw this session's own visual output — not the scene itself, see the render-surface boundary (§3.6). */
  render(context: RenderingContext, frame: SceneTransitionFrame): void;
  /** `true` once this session has fully finished. Must never be `true` before {@link SceneTransitionEnvironment.committed} is also `true` — see {@link SceneTransitionLifecycleError}. */
  readonly done: boolean;
  /** Which render layer this session's output composites against, read live every frame — see §3.6. May change mid-session (composed sessions, Slice 6). */
  readonly placement: 'scene' | 'screen';
  /** Called exactly once, regardless of exit path (normal completion, pre-commit abort, post-commit failure, or the Director being destroyed mid-session). No further `update()`/`render()` calls follow. */
  destroy(): void;
}

/**
 * Reusable, immutable transition definition — construct once, use across
 * arbitrarily many navigations (even concurrently, across multiple
 * `Application`s). All per-navigation mutable state lives on the
 * {@link SceneTransitionSession} a call to {@link SceneTransition.beginSession}
 * produces, never on the definition itself.
 * @stable
 */
export abstract class SceneTransition {
  /** Pure, synchronous. Called once, before a session starts, so the Director can provision render resources up front. */
  public abstract getRequirements(context: SceneTransitionContext): SceneTransitionRequirements;

  /**
   * Called by the Director — do not call directly. Dispatches to
   * {@link SceneTransition.createSession}, which is `protected` so it does
   * not clutter a beginner's view of a transition subclass while still being
   * callable from Director code that does not share this class's hierarchy.
   */
  public beginSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    return this.createSession(environment);
  }

  /** Construct this navigation's session. Override in a subclass. */
  protected abstract createSession(environment: SceneTransitionEnvironment): SceneTransitionSession;
}

/**
 * Thrown when a {@link SceneTransitionSession} or {@link SceneTransitionEnvironment}
 * violates the transition lifecycle contract:
 * - `'commit-reentrant'` — {@link SceneTransitionEnvironment.commit} was called
 *   a second time on the same session. Dev-mode only; a production build
 *   no-ops the second call instead of throwing.
 * - `'done-before-commit'` — the session reported {@link SceneTransitionSession.done}
 *   `true` while {@link SceneTransitionEnvironment.committed} was still
 *   `false`. Always thrown, dev and production — the navigation aborts and
 *   the session is destroyed.
 * - `'aborted'` — the owning `SceneDirector` was destroyed while this
 *   session was still active. Always thrown.
 */
export class SceneTransitionLifecycleError extends Error {
  public readonly reason: 'commit-reentrant' | 'done-before-commit' | 'aborted';

  public constructor(reason: 'commit-reentrant' | 'done-before-commit' | 'aborted') {
    super(SceneTransitionLifecycleError._messageFor(reason));
    this.name = 'SceneTransitionLifecycleError';
    this.reason = reason;
  }

  private static _messageFor(reason: 'commit-reentrant' | 'done-before-commit' | 'aborted'): string {
    switch (reason) {
      case 'commit-reentrant':
        return 'environment.commit() was called a second time on the same SceneTransitionSession. commit() may only be called once per session.';
      case 'done-before-commit':
        return 'SceneTransitionSession.done became true while SceneTransitionEnvironment.committed was still false. A session must not report done before the navigation has actually committed.';
      case 'aborted':
        return 'SceneDirector was destroyed while a SceneTransitionSession was still active.';
    }
  }
}
