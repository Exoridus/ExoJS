import type { Application } from '@codexo/exojs';
import { type CanvasHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactElement } from 'react';

import { ExoContext } from './ExoContext';
import { type ExoApplicationOptions, useExoApplication } from './useExoApplication';

/** Default canvas style: block layout avoids the inline-element baseline gap. */
const defaultCanvasStyle: CSSProperties = { display: 'block' };

export interface ExoCanvasProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Options forwarded to the ExoJS {@link Application}. Pass
   * `canvas.width`/`height`/`sizingMode`/etc.; most options are captured at
   * creation, but `canvas.width`/`height`, `canvas.sizingMode` and `clearColor`
   * are applied live (see {@link useExoApplication}).
   */
  options?: ExoApplicationOptions;
  /**
   * Called once each time the {@link Application} is (re)created. The backend
   * (WebGL2 / WebGPU) is not yet initialized at this point — that happens when
   * the first {@link import('./useScene').useScene} child calls `app.start()`.
   */
  onReady?: (app: Application) => void;
  /**
   * Props forwarded to the inner `<canvas>` (e.g. its own `style`/`className`).
   * `ref`, `width` and `height` are managed by the engine and cannot be set.
   */
  canvasProps?: Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'ref' | 'width' | 'height'>;
}

/**
 * Batteries-included canvas host. Renders a **positioned wrapper `<div>`**
 * containing a React-managed `<canvas>` bound to an ExoJS {@link Application},
 * and provides the app to descendant hooks via context. Because the wrapper is
 * `position: relative`, absolutely-positioned `children` (HUD overlays,
 * {@link import('./Scenes').Scenes}) sit over the canvas out of the box.
 *
 * Layout props (`style`, `className`, …) apply to the **wrapper**; size it to
 * size the canvas in `'fill'`/`'letterbox'` modes. Use {@link canvasProps} to
 * style the canvas itself. For full control with no wrapper element, use the
 * headless {@link useExoApplication} hook directly.
 *
 * @example
 * ```tsx
 * <ExoCanvas options={{ canvas: { width: 800, height: 600 } }} style={{ width: 800, height: 600 }}>
 *   <Hud /> // absolutely-positioned overlay; works because the wrapper is relative
 * </ExoCanvas>
 * ```
 */
export function ExoCanvas({ options, onReady, canvasProps, children, style, ...divProps }: ExoCanvasProps): ReactElement {
  const { app, canvasRef } = useExoApplication(options, onReady);

  const { style: canvasStyle, ...restCanvasProps } = canvasProps ?? {};
  const wrapperStyle: CSSProperties = { position: 'relative', ...style };
  const mergedCanvasStyle: CSSProperties = { ...defaultCanvasStyle, ...canvasStyle };

  return (
    <ExoContext.Provider value={app}>
      <div style={wrapperStyle} {...divProps}>
        <canvas ref={canvasRef} style={mergedCanvasStyle} {...restCanvasProps} />
        {app !== null && children}
      </div>
    </ExoContext.Provider>
  );
}
