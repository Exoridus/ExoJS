import type { Application } from '@codexo/exojs';
import { type CSSProperties, type HTMLAttributes, type ReactElement } from 'react';

import { ExoContext } from './ExoContext';
import { type ExoApplicationOptions, useExoApplication } from './useExoApplication';

export interface ExoCanvasProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Options forwarded to the ExoJS {@link Application}. The canvas element and
   * its mount point are managed by this component; you may still pass
   * `canvas.width`/`height`/`sizingMode`/etc. Most options are captured at
   * creation, but `canvas.width`/`height`, `canvas.sizingMode` and `clearColor`
   * are applied live when they change (see {@link useExoApplication}).
   */
  options?: ExoApplicationOptions;
  /**
   * Called once each time the {@link Application} is (re)created. Note the
   * backend (WebGL2 / WebGPU) is not yet initialized at this point — backend
   * init happens when the first {@link useScene} child calls `app.start()`.
   */
  onReady?: (app: Application) => void;
}

/**
 * Mounts a `<canvas>` inside a container `<div>`, creates an ExoJS
 * {@link Application}, and provides it to all descendant hooks via React
 * context. Children render only after the Application exists.
 *
 * A thin wrapper over {@link useExoApplication} — use that hook directly if you
 * need to own the container element yourself. The Application is destroyed (and
 * the canvas removed) on unmount; scene lifecycle is managed by {@link useScene}.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ExoCanvas options={{ canvas: { width: 800, height: 600 } }}>
 *       <GameScene />
 *     </ExoCanvas>
 *   );
 * }
 * ```
 */
export function ExoCanvas({ options, onReady, children, style, ...divProps }: ExoCanvasProps): ReactElement {
  const { app, containerRef } = useExoApplication(options, onReady);

  const containerStyle: CSSProperties = { position: 'relative', ...style };

  return (
    <ExoContext.Provider value={app}>
      <div ref={containerRef} style={containerStyle} {...divProps}>
        {app !== null && children}
      </div>
    </ExoContext.Provider>
  );
}
