import { createContext, useContext } from 'react';

import type { Application } from '@codexo/exojs';

/**
 * Internal React context that carries the active {@link Application} instance
 * created by {@link ExoCanvas}. Consumers should use the {@link useExoApp}
 * hook rather than reading this context directly; the context object is
 * exported for advanced use (e.g. testing, custom providers).
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ExoContext = createContext<Application | null>(null);
ExoContext.displayName = 'ExoContext';

/**
 * Returns the nearest {@link Application} from the React tree, or `null`
 * when called outside of an {@link ExoCanvas}. Prefer {@link useExoApp} for
 * component-level use — it throws an actionable error instead of returning
 * null.
 */
export function useExoContext(): Application | null {
  return useContext(ExoContext);
}
