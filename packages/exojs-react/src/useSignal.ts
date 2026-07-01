import type { Signal } from '@codexo/exojs';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to an ExoJS {@link Signal} and returns the latest value computed by
 * `getSnapshot`, re-rendering the component every time the signal dispatches.
 * Built on `useSyncExternalStore`, so reads stay tear-free under concurrent
 * rendering.
 *
 * The signal itself is only used to know *when* to re-read — `getSnapshot` is
 * responsible for producing the actual value (usually a getter on the engine
 * object the signal lives on).
 *
 * @example
 * ```tsx
 * function FrameCounter() {
 *   const app = useExoApp();
 *   // Re-renders on every `onFrame` dispatch (i.e. every engine frame).
 *   const frameCount = useSignal(app.onFrame, () => app.frameCount);
 *   return <span>Frame: {frameCount}</span>;
 * }
 * ```
 *
 * @param signal - The signal to subscribe to. `null`/`undefined` is accepted
 *   (e.g. before an `Application` exists) — the hook simply does not subscribe
 *   to anything and `getSnapshot` still runs on every render.
 * @param getSnapshot - Reads the current value. Called on mount and again after
 *   every dispatch of `signal`.
 */
export function useSignal<Args extends unknown[], T>(signal: Signal<Args> | null | undefined, getSnapshot: () => T): T {
  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!signal) {
        return () => {};
      }

      signal.add(onStoreChange);

      return () => {
        signal.remove(onStoreChange);
      };
    },
    [signal],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
