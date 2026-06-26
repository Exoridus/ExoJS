import type { Application } from '@codexo/exojs';

import { useExoContext } from './ExoContext';

/**
 * Returns the {@link Application} instance from the nearest {@link ExoCanvas}
 * ancestor. Throws an informative error when called outside of an
 * `<ExoCanvas>` tree.
 *
 * @throws {Error} When no `<ExoCanvas>` ancestor is present.
 *
 * @example
 * ```tsx
 * function HudOverlay() {
 *   const app = useExoApp();
 *   return <span>Frame: {app.frameCount}</span>;
 * }
 * ```
 */
export function useExoApp(): Application {
  const app = useExoContext();

  if (app === null) {
    throw new Error('useExoApp must be used inside an <ExoCanvas> component.');
  }

  return app;
}
