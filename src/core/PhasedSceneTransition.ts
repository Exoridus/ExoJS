import type { SceneTransitionRequirements } from './SceneTransition';

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
