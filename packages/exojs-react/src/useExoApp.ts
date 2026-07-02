import type { Application } from '@codexo/exojs';

import { useExoContext } from './ExoContext';

/**
 * Returns the {@link Application} instance from the nearest {@link ExoCanvas}
 * ancestor. Throws an informative error when called outside of an
 * `<ExoCanvas>` tree.
 *
 * @throws {Error} When no `<ExoCanvas>` ancestor is present.
 *
 * `app.frameCount` is a plain getter updated by the engine's own frame loop —
 * reading it here does not, on its own, make `HudOverlay` re-render. Pair it
 * with {@link import('./useSignal').useSignal} to subscribe to `app.onFrame`
 * and re-render on every dispatch.
 *
 * @example
 * ```tsx
 * function HudOverlay() {
 *   const app = useExoApp();
 *   const frameCount = useSignal(app.onFrame, () => app.frameCount);
 *   return <span>Frame: {frameCount}</span>;
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
