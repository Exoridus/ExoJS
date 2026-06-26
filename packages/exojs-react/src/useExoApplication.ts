import { Application, type ApplicationOptions, type CanvasApplicationOptions, type Color } from '@codexo/exojs';
import { type Ref, useEffect, useRef, useState } from 'react';

/**
 * Options for {@link useExoApplication} / {@link import('./ExoCanvas').ExoCanvas}.
 *
 * Same as {@link ApplicationOptions} but the `canvas.element` and `canvas.mount`
 * fields are managed for you (the hook creates and mounts the canvas), so they
 * are omitted. You may still pass `canvas.width`/`height`/`sizingMode`/etc.
 */
export type ExoApplicationOptions = Omit<ApplicationOptions, 'canvas'> & {
  readonly canvas?: Omit<CanvasApplicationOptions, 'element' | 'mount'>;
};

/** Return value of {@link useExoApplication}. */
export interface UseExoApplicationResult {
  /** The Application instance, or `null` until it has been created. */
  readonly app: Application | null;
  /**
   * Attach this to the container element the canvas should mount into. Typed as
   * `Ref` (not `RefObject`) so the same code type-checks against both
   * `@types/react` 18 and 19, whose `useRef`/`RefObject` nullability differ.
   */
  readonly containerRef: Ref<HTMLDivElement>;
}

/** Stable string key for the colour so the sync effect can depend on its value. */
function colorKey(color: Color | undefined): string | undefined {
  return color === undefined ? undefined : `${color.r},${color.g},${color.b},${color.a}`;
}

/**
 * Creates and owns an ExoJS {@link Application}, mounting a `<canvas>` into the
 * element referenced by the returned `containerRef`. This is the lower-level
 * primitive that {@link import('./ExoCanvas').ExoCanvas} is built on — reach for
 * it when you need to render your own container or read the app outside the
 * usual `<ExoCanvas>` tree.
 *
 * **Reactivity model.** The Application is recreated only when an *identity*
 * option changes — currently the render `backend` (you cannot hot-swap WebGL2 ↔
 * WebGPU). All other supported options are applied *live* without tearing the
 * app down:
 *
 * - `canvas.width` / `canvas.height` → `app.resize(...)`
 * - `canvas.sizingMode` → `app.sizingMode`
 * - `clearColor` → `app.clearColor`
 *
 * Options without a live setter (e.g. `canvas.pixelRatio`, `seed`, `extensions`)
 * are captured at creation; change the `backend` or remount to apply them.
 *
 * @param options - Application options (canvas element/mount are managed).
 * @param onReady - Called once each time an Application is created.
 */
export function useExoApplication(
  options?: ExoApplicationOptions,
  onReady?: (app: Application) => void,
): UseExoApplicationResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);

  // Latest onReady without retriggering the lifecycle effect. Updated in an
  // effect (not during render) so the ref-write happens after commit.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  // Identity: only the backend type forces a full recreation.
  const backendKey = options?.backend?.type ?? 'auto';

  // ── Lifecycle: create on mount / recreate on backend change ───────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const application = new Application({
      ...options,
      canvas: { ...options?.canvas, element: canvas },
    });

    setApp(application);
    onReadyRef.current?.(application);

    return () => {
      application.destroy();
      canvas.remove();
      setApp(null);
    };
    // Recreate only when the backend identity changes; live options are synced
    // by the effects below. `options` is intentionally read at (re)create time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendKey]);

  // ── Live sync: size ───────────────────────────────────────────────────────
  const width = options?.canvas?.width;
  const height = options?.canvas?.height;
  useEffect(() => {
    if (app !== null && width !== undefined && height !== undefined) {
      app.resize(width, height);
    }
  }, [app, width, height]);

  // ── Live sync: sizing mode ────────────────────────────────────────────────
  const sizingMode = options?.canvas?.sizingMode;
  useEffect(() => {
    if (app !== null && sizingMode !== undefined) {
      app.sizingMode = sizingMode;
    }
  }, [app, sizingMode]);

  // ── Live sync: clear colour ───────────────────────────────────────────────
  const clearColor = options?.clearColor;
  const clearKey = colorKey(clearColor);
  useEffect(() => {
    if (app !== null && clearColor !== undefined) {
      app.clearColor = clearColor;
    }
    // clearColor identity is unstable; depend on its value key instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, clearKey]);

  return { app, containerRef };
}
