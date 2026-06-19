import { clamp } from '#math/utils';

import type { Voice } from './Playable';

export interface CrossFadeOptions {
  /** Volume to fade the `to` voice up to. Range [0, 1]. Default 1. */
  toVolume?: number;
}

/**
 * Cross-fade from one playing {@link Voice} to another over `durationMs`.
 *
 * Fades `from` to silence and stops it (`from.stop(durationMs)`) while ramping
 * `to` up to `toVolume` (`to.fade(...)`). Both voices must already be playing —
 * start the incoming voice (typically at volume 0) before calling, e.g.:
 *
 * ```ts
 * const next = app.audio.play(track, { volume: 0 });
 * await crossFade(current, next, 1000);
 * ```
 *
 * Returns a Promise that resolves once `durationMs` elapses.
 */
export async function crossFade(from: Voice, to: Voice, durationMs: number, options: CrossFadeOptions = {}): Promise<void> {
  const target = clamp(options.toVolume ?? 1, 0, 1);

  to.fade(target, durationMs);
  from.stop(durationMs);

  return new Promise<void>(resolve => {
    setTimeout(resolve, Math.max(0, durationMs));
  });
}
