import { Ease } from '#animation/Easing';
import type { EasingFunction } from '#animation/types';
import type { RenderingContext } from '#rendering/RenderingContext';

import {
  SceneTransition,
  type SceneTransitionContext,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from './SceneTransition';
import type { Time } from './Time';

/**
 * Per-phase render-resource requirements for one phase (`enter` or `exit`)
 * of a {@link PhasedSceneTransition}. Same shape as {@link SceneTransitionRequirements}
 * — kept as a distinct type because a phase declares its *own* requirements,
 * which the Director then merges with the other phase's via
 * {@link mergeSceneTransitionRequirements} to produce the session-wide
 * {@link SceneTransitionRequirements} (spec §3.9.1).
 */
export interface SceneTransitionPhaseRequirements {
  readonly outgoingFrame: 'none' | 'snapshot';
  readonly currentFrame: 'none' | 'direct' | 'texture';
}

const outgoingFrameRank = { none: 0, snapshot: 1 } as const;
const currentFrameRank = { none: 0, direct: 1, texture: 2 } as const;

/**
 * Join two phases' {@link SceneTransitionPhaseRequirements} into one
 * session-wide {@link SceneTransitionRequirements} — the stronger
 * requirement wins on each axis independently (spec §3.9.1). This is the
 * entire "direct → texture identity-composite promotion" rule: once this
 * merge picks `texture`, the existing per-frame live-surface-to-texture
 * render (spec §3.4) already populates `frame.current` for *any*
 * `texture`-requesting session — a promoted phase that itself only
 * declared `direct` never needs to know it was promoted.
 */
export function mergeSceneTransitionRequirements(a: SceneTransitionPhaseRequirements, b: SceneTransitionPhaseRequirements): SceneTransitionRequirements {
  return {
    outgoingFrame: outgoingFrameRank[a.outgoingFrame] >= outgoingFrameRank[b.outgoingFrame] ? a.outgoingFrame : b.outgoingFrame,
    currentFrame: currentFrameRank[a.currentFrame] >= currentFrameRank[b.currentFrame] ? a.currentFrame : b.currentFrame,
  };
}

/** Construction options for {@link PhasedSceneTransition} and its subclasses. */
export interface PhasedSceneTransitionOptions {
  /** Duration of *each* phase (enter and exit run this long independently), in milliseconds. Default `220`. */
  readonly duration?: number;
  /** Applied to both phases' `progress` to produce `easedProgress`. Default {@link Ease.linear}. */
  readonly easing?: EasingFunction;
  /** Which render layer this transition's output composites against (spec §3.6). Default `'screen'`. */
  readonly placement?: 'scene' | 'screen';
}

/**
 * Per-frame context handed to {@link PhasedSceneTransition.enter}/
 * {@link PhasedSceneTransition.exit}. Spec §3.9.
 */
export interface SceneTransitionPhaseContext {
  readonly phase: 'enter' | 'exit';
  /** Chronological progress of this phase. Always 0 → 1, regardless of phase. */
  readonly progress: number;
  /** `progress` after this transition's `easing` function. Always 0 → 1. */
  readonly easedProgress: number;
  /**
   * Visual presence of the affected scene — `enter`: 0 → 1 (offscreen →
   * onscreen); `exit`: 1 → 0 (onscreen → offscreen). Lets both phases share
   * one formula (e.g. `lerp(offscreenX, 0, presence)`) without either
   * inverting anything itself.
   */
  readonly presence: number;
  readonly frame: SceneTransitionFrame;
  readonly rendering: RenderingContext;
}

/**
 * Single-class `enter()`/`exit()` authoring layer over the full
 * {@link SceneTransition} contract (spec §3.9) — covers the common case
 * (fade, slide, wipe, a custom flash) with no need to hand-manage timing,
 * easing, or session lifecycle. Subclasses implement
 * {@link PhasedSceneTransition.getPhaseRequirements} and override
 * {@link PhasedSceneTransition.enter}/{@link PhasedSceneTransition.exit} —
 * `createSession()` is implemented once, here, and never needs overriding
 * for this common case.
 * @stable
 */
export abstract class PhasedSceneTransition extends SceneTransition {
  public readonly duration: number;
  public readonly easing: EasingFunction;
  public readonly placement: 'scene' | 'screen';

  /**
   * Public — an abstract class with a `protected` constructor is still not
   * directly instantiable (that's what `abstract` already does), but a
   * *protected* constructor is inherited: a concrete subclass that declares
   * no constructor of its own (the common case — e.g. a `FlashTransition`
   * with only `enter()`/`exit()`) would inherit it and become
   * uninstantiable from outside the module. Public keeps every minimal
   * subclass usable with zero boilerplate.
   */
  public constructor(options: PhasedSceneTransitionOptions = {}) {
    super();
    this.duration = options.duration ?? 220;
    this.easing = options.easing ?? Ease.linear;
    this.placement = options.placement ?? 'screen';
  }

  /**
   * Director entry point — mirrors {@link SceneTransition.beginSession}/
   * `createSession()` (spec §3.1a): the Director (and, for `{ enter, exit }`
   * composition, a sibling `PhasedSceneTransition` instance's own session
   * driver) calls this directly on a phase instance it doesn't own the
   * hierarchy of, which the `protected` {@link PhasedSceneTransition.getPhaseRequirements}
   * authoring hook cannot support on its own. Authors implement
   * `getPhaseRequirements()`; nothing else calls it directly.
   */
  public getRequirementsForPhase(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements {
    return this.getPhaseRequirements(phase, context);
  }

  /** Declare this phase's render-resource requirements. See {@link SceneTransitionPhaseRequirements}. */
  protected abstract getPhaseRequirements(phase: 'enter' | 'exit', context: SceneTransitionContext): SceneTransitionPhaseRequirements;

  /** Draw one frame of the `enter` phase. No-op by default — override for a visible enter effect. */
  protected enter(_context: SceneTransitionPhaseContext): void {}

  /** Draw one frame of the `exit` phase. No-op by default — override for a visible exit effect. */
  protected exit(_context: SceneTransitionPhaseContext): void {}

  public override getRequirements(context: SceneTransitionContext): SceneTransitionRequirements {
    return mergeSceneTransitionRequirements(this.getRequirementsForPhase('exit', context), this.getRequirementsForPhase('enter', context));
  }

  /**
   * Session-driver entry point for rendering one frame of `phase` —
   * mirrors {@link PhasedSceneTransition.getRequirementsForPhase} exactly:
   * {@link PhasedSceneTransitionSession} (and, for `{ enter, exit }`
   * composition, a *different* `PhasedSceneTransition` instance's session)
   * is not a subclass of this class and cannot call the `protected`
   * {@link PhasedSceneTransition.enter}/{@link PhasedSceneTransition.exit}
   * hooks directly. Authors override `enter()`/`exit()`; nothing else calls
   * them directly.
   */
  public runPhase(phase: 'enter' | 'exit', context: SceneTransitionPhaseContext): void {
    if (phase === 'enter') {
      this.enter(context);
    } else {
      this.exit(context);
    }
  }

  protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
    return new PhasedSceneTransitionSession(this, this, environment);
  }
}

type PhasedTransitionPhaseState = 'exit' | 'holding' | 'enter' | 'done';

/**
 * Drives one {@link SceneTransitionSession} for a `{ enter, exit }` pair —
 * `exitPhase` and `enterPhase` may be the *same* instance (the common,
 * single-`PhasedSceneTransition` case — spec §3.9) or two independently
 * authored instances (composition — spec §3.9.1, {@link composePhasedSceneTransition}).
 * Exit runs 0→1, then `environment.commit()` is requested exactly once and
 * the session holds at the exit end-state until `environment.committed`
 * is observed true on a later `update()` call (never reentrantly within
 * the same call that requested it — spec §3.5.2), then enter runs 0→1 to
 * `done`.
 * @internal
 */
export class PhasedSceneTransitionSession implements SceneTransitionSession {
  private _phaseState: PhasedTransitionPhaseState = 'exit';
  private _elapsedMs = 0;

  public constructor(
    private readonly _exitPhase: PhasedSceneTransition,
    private readonly _enterPhase: PhasedSceneTransition,
    private readonly _environment: SceneTransitionEnvironment,
  ) {}

  public get done(): boolean {
    return this._phaseState === 'done';
  }

  public get placement(): 'scene' | 'screen' {
    return this._phaseState === 'enter' ? this._enterPhase.placement : this._exitPhase.placement;
  }

  public update(delta: Time): void {
    if (this._phaseState === 'done') {
      return;
    }

    if (this._phaseState === 'holding') {
      if (!this._environment.committed) {
        return;
      }

      // Falls through to process the freshly-entered `enter` phase's advance
      // with this same delta, rather than returning and wasting an entire
      // extra frame at 0 progress — the "holding" wait consumes zero of the
      // enter phase's own duration, but the frame that finally observes
      // `committed` should not be a second no-op frame on top of that.
      this._phaseState = 'enter';
      this._elapsedMs = 0;
    }

    const activePhase = this._phaseState === 'exit' ? this._exitPhase : this._enterPhase;

    this._elapsedMs = Math.min(activePhase.duration, this._elapsedMs + Math.max(0, delta.milliseconds));

    if (this._elapsedMs >= activePhase.duration) {
      if (this._phaseState === 'exit') {
        if (!this._environment.commitRequested) {
          this._environment.commit();
        }

        this._phaseState = 'holding';
      } else {
        this._phaseState = 'done';
      }
    }
  }

  public render(context: RenderingContext, frame: SceneTransitionFrame): void {
    // `'done'` still renders — it maps to `enter`'s own resting frame
    // (progress 1 / presence 1), same as `'holding'` maps to `exit`'s
    // resting frame: the terminal frame must be renderable at least once
    // before the Director tears the session down (mirrors 'holding' below,
    // which also renders the *previous* phase's end-state, not a live one).
    const phase: 'enter' | 'exit' = this._phaseState === 'enter' || this._phaseState === 'done' ? 'enter' : 'exit';
    const activePhase = phase === 'enter' ? this._enterPhase : this._exitPhase;
    const progress = activePhase.duration === 0 ? 1 : Math.min(1, this._elapsedMs / activePhase.duration);
    const easedProgress = activePhase.easing(progress);
    const presence = phase === 'enter' ? easedProgress : 1 - easedProgress;

    activePhase.runPhase(phase, { phase, progress, easedProgress, presence, frame, rendering: context });
  }

  public destroy(): void {
    // No resources of its own — pooled textures/input gate are Director-owned (spec §3.4/§3.7b).
  }
}
