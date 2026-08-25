// Always-on guard for the engine's synchronous lifecycle hooks.
//
// Nothing in this module is `__DEV__`-gated. An `async` override of a hook the
// engine never awaits drops that hook's timing and swallows every error it
// throws, so the failure has to look the same in a production build as it does
// in development - a dev-only warning would hide the exact defect it is meant
// to surface. This is the {@link invariant} category from `./dev`, not the
// {@link assert} one: it throws in every build and is never stripped.
//
// The type system rejects an async override ahead of this guard (see
// {@link Synchronous}); the guard covers what types cannot reach - plain
// JavaScript consumers, `any`, `Object.assign`ed methods, and anything crossing
// a module boundary untyped.

const swallow = (): void => {
  // Intentionally empty - see requireSynchronousHook's detach comment.
};

/**
 * Class name of `owner`, or `fallback` when it has none worth reporting - a
 * plain object literal, a null-prototype object, or an anonymous class
 * expression.
 */
export const hookOwnerName = (owner: object, fallback: string): string => {
  const name = (owner as { constructor?: { name?: string } }).constructor?.name;

  return name === undefined || name === '' || name === 'Object' ? fallback : name;
};

/**
 * Throw when a hook that must be synchronous returned a thenable. `subject` is
 * the fully qualified hook (`'GameScene.update()'`) and `remedy` the sentence
 * telling the caller where the asynchronous work belongs instead.
 *
 * Callers keep the check off the hot path with a `result !== undefined` test,
 * so a well-behaved hook costs one comparison per dispatch and never reaches
 * this function.
 */
export const requireSynchronousHook = (result: unknown, subject: string, remedy: string): void => {
  if (result === null || typeof result !== 'object' || typeof (result as PromiseLike<unknown>).then !== 'function') {
    return;
  }

  // Detach the abandoned thenable's rejection. The engine drops this result by
  // design, so its eventual rejection must never surface as an unhandled
  // rejection stacked on top of the lifecycle error thrown below.
  void Promise.resolve(result as PromiseLike<unknown>).catch(swallow);

  throw new Error(`[ExoJS] ${subject} returned a Promise, but it must be synchronous. ${remedy}`);
};
