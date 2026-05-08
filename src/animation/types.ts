export type { EasingFunction } from './Easing';

/**
 * Lifecycle states of a {@link Tween}. A tween starts in `Idle`, transitions
 * to `Active` once {@link Tween.start} is called, and ends in `Complete`
 * (natural finish, all repeats exhausted) or `Stopped` (cancelled via
 * {@link Tween.stop}). `Paused` is reachable from `Active` only.
 */
export enum TweenState {
  Idle = 'idle',
  Active = 'active',
  Paused = 'paused',
  Complete = 'complete',
  Stopped = 'stopped',
}

/**
 * Callback fired at one of the tween lifecycle points (start, complete,
 * each repeat cycle). No arguments — use a closure to access related state.
 */
export type TweenLifecycleCallback = () => void;

/**
 * Callback fired on every update during the active phase of a tween.
 * Receives the eased progress in 0..1, after applying the easing function and
 * accounting for yoyo direction.
 */
export type TweenUpdateCallback = (progress: number) => void;
