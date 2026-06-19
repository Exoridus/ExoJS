import { clamp } from '#math/utils';

import type { Voice } from './Playable';

export interface CrossFadeOptions {
  /** Volume to fade the `to` voice up to. Range [0, 1]. Default 1. */
  toVolume?: number;
  /**
   * Stop the `from` voice once the fade completes (default `true`) — the right
   * choice for a one-shot transition, since it frees the outgoing voice. Pass
   * `false` to leave `from` playing at volume 0, e.g. when you crossfade back
   * and forth between two looping tracks.
   */
  stopAfter?: boolean;
}

/**
 * Cross-fade from one playing {@link Voice} to another over `durationMs`.
 *
 * Ramps `to` up to `toVolume` and `from` down to silence. By default `from` is
 * stopped when the fade finishes; pass `stopAfter: false` to keep it alive.
 * Both voices must already be playing — start the incoming voice (typically at
 * volume 0) before calling:
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
  const stopAfter = options.stopAfter ?? true;

  to.fade(target, durationMs);

  if (stopAfter) {
    from.stop(durationMs);
  } else {
    from.fade(0, durationMs);
  }

  return new Promise<void>(resolve => {
    setTimeout(resolve, Math.max(0, durationMs));
  });
}
