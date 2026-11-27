/**
 * Race a pending operation against a hang guard, resolving to `onTimeout` when
 * the guard fires first.
 *
 * The guard is disarmed on every settlement, not only on success: an operation
 * that rejects (a determinism divergence fails the run) must not leave the
 * process waiting out the full timeout before it can exit. The operation's own
 * rejection is never surfaced as unhandled - the caller sees it through the
 * returned promise, or not at all when the guard already won.
 */
export const raceWithTimeout = async <T, F>(run: Promise<T>, timeoutMs: number, onTimeout: F): Promise<T | F> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<F>(resolvePromise => {
    timer = setTimeout(() => resolvePromise(onTimeout), timeoutMs);
  });

  run.catch(() => {
    /* the pending operation may outlive the race; its rejection is not a result */
  });

  try {
    return await Promise.race([run, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
