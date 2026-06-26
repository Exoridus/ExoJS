import type { Application } from '@codexo/exojs';
import { type CanvasHTMLAttributes, type ReactElement } from 'react';

import { ExoContext } from './ExoContext';
import { type ExoApplicationOptions, useExoApplication } from './useExoApplication';

export interface ExoCanvasProps extends Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'width' | 'height'> {
  /**
   * Options forwarded to the ExoJS {@link Application}. The canvas element is the
   * one this component renders. Pass `canvas.width`/`height`/`sizingMode`/etc.;
   * most options are captured at creation, but `canvas.width`/`height`,
   * `canvas.sizingMode` and `clearColor` are applied live (see
   * {@link useExoApplication}).
   */
  options?: ExoApplicationOptions;
  /**
   * Called once each time the {@link Application} is (re)created. Note the
   * backend (WebGL2 / WebGPU) is not yet initialized at this point — backend
   * init happens when the first {@link import('./useScene').useScene} child
   * calls `app.start()`.
   */
  onReady?: (app: Application) => void;
}

/**
 * Renders a single `<canvas>` bound to an ExoJS {@link Application} and provides
 * it to descendant hooks via React context. **It renders no wrapper element** —
 * all canvas attributes (`style`, `className`, `id`, event handlers, …) are
 * forwarded to the canvas, so you keep full control over the element and its
 * container. Place it inside whatever container you like.
 *
 * `children` (HUD overlays, {@link import('./Scenes').Scenes}) render as
 * siblings of the canvas under the context provider — wrap them and the
 * `<ExoCanvas>` in your own positioned container to overlay them.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <div style={{ position: 'relative', width: 800, height: 600 }}>
 *       <ExoCanvas
 *         options={{ canvas: { width: 800, height: 600 } }}
 *         style={{ display: 'block' }}
 *       >
 *         <Hud /> // absolutely-positioned overlay you style yourself
 *       </ExoCanvas>
 *     </div>
 *   );
 * }
 * ```
 */
export function ExoCanvas({ options, onReady, children, ...canvasProps }: ExoCanvasProps): ReactElement {
  const { app, canvasRef } = useExoApplication(options, onReady);

  return (
    <ExoContext.Provider value={app}>
      <canvas ref={canvasRef} {...canvasProps} />
      {app !== null && children}
    </ExoContext.Provider>
  );
}
