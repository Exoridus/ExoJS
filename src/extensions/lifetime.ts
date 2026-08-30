import type { Application } from '#core/Application';
import { logger } from '#core/Logger';

import type { Extension, ExtensionDisposer } from './Extension';

/**
 * Run every descriptor's `install(app)` hook in snapshot order - dependencies
 * before their dependents - appending each returned disposer to `disposers`.
 *
 * `disposers` is the caller's list, mutated as installation progresses rather
 * than returned at the end, precisely so a throwing `install` still leaves the
 * caller holding what did install. That is what the Application's constructor
 * rollback unwinds; without it, a failure in the last of five extensions would
 * strand the four before it.
 * @internal
 */
export const installExtensions = (app: Application, extensions: readonly Extension[], disposers: ExtensionDisposer[]): void => {
  for (const extension of extensions) {
    const disposer = extension.install?.(app);

    if (typeof disposer === 'function') {
      disposers.push(disposer);
    }
  }
};

/**
 * Run and drop every disposer in `disposers`, in reverse installation order.
 * The list drains as it goes, so a second call has nothing left to do - which
 * is what makes a repeated teardown a no-op rather than a second round of
 * disposal.
 *
 * Each disposer is guarded on its own and failures are logged rather than
 * rethrown - the same contract {@link SystemRegistry.destroy} keeps, and for
 * the same reason. Both call sites are unguarded steps of an ordered teardown
 * (`Application`'s managed-resource disposal and its constructor rollback), so
 * a throw here would strand everything scheduled behind it. An extension is
 * third-party code by definition, which makes a throwing disposer the case to
 * expect rather than a remote one.
 * @internal
 */
export const disposeExtensions = (disposers: ExtensionDisposer[]): void => {
  while (disposers.length > 0) {
    try {
      disposers.pop()?.();
    } catch (error) {
      logger.error('An extension disposer threw while the application was tearing down.', {
        source: 'Application',
        ...(error instanceof Error && { error }),
      });
    }
  }
};
