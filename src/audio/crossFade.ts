import type { AbstractMedia } from './AbstractMedia';

export interface CrossFadeOptions {
  /** Stop the `from` media after fade completes. Default true. */
  stopAfterFade?: boolean;
  /** Auto-play `to` if currently paused. Default true. */
  autoPlayTarget?: boolean;
}

/**
 * Cross-fade from one media instance to another over `durationMs`.
 *
 * Calls `from.fadeOut(durationMs)` and `to.fadeIn(durationMs)` in parallel.
 * If `to` is paused at call time and `autoPlayTarget !== false`, it will
 * be played first (so the fade-in is audible).
 *
 * Returns a Promise that resolves after `durationMs` elapses (i.e., when
 * the fade completes). Use `await crossFade(...)` for sequential music
 * transitions, or fire-and-forget for non-blocking transitions.
 */
export async function crossFade(from: AbstractMedia, to: AbstractMedia, durationMs: number, options: CrossFadeOptions = {}): Promise<void> {
  const stopAfterFade = options.stopAfterFade ?? true;
  const autoPlayTarget = options.autoPlayTarget ?? true;

  if (autoPlayTarget && to.paused) {
    to.play();
  }

  from.fadeOut(durationMs, { stopAfter: stopAfterFade });
  to.fadeIn(durationMs);

  return new Promise<void>(resolve => {
    setTimeout(resolve, Math.max(0, durationMs));
  });
}
