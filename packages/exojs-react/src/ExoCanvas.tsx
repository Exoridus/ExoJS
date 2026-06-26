import { type CSSProperties, type HTMLAttributes, type ReactElement, useEffect, useRef, useState } from 'react';

import { Application, type ApplicationOptions } from '@codexo/exojs';

import { ExoContext } from './ExoContext';

export interface ExoCanvasProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Options forwarded to the {@link Application} constructor, excluding
   * `canvas` (which is managed by this component). Use the wrapping `<div>`
   * props (e.g. `style`, `className`) to control layout; use
   * `options.canvas.sizingMode` alternatives via CSS on the container.
   */
  options?: Omit<ApplicationOptions, 'canvas'>;
  /**
   * Called once after the {@link Application} instance is created and made
   * available in the React tree. Note that the backend (WebGL2 / WebGPU) is
   * not yet initialized at this point — backend initialization happens when
   * the first {@link useScene} child calls `app.start()`. Subscribe to
   * `app.onFrame` or check `app.status` to detect when the engine is running.
   */
  onReady?: (app: Application) => void;
}

/**
 * Mounts a `<canvas>` inside a container `<div>`, creates an ExoJS
 * {@link Application}, and provides it to all descendant hooks via React
 * context. Children are rendered only after the Application is ready.
 *
 * The Application is destroyed (and the canvas removed) when this component
 * unmounts. Scene lifecycle is managed separately by {@link useScene}.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ExoCanvas style={{ width: 800, height: 600 }} onReady={(app) => console.log(app)}>
 *       <GameScene />
 *     </ExoCanvas>
 *   );
 * }
 * ```
 */
export function ExoCanvas({ options, onReady, children, style, ...divProps }: ExoCanvasProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [app, setApp] = useState<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const application = new Application({ canvas: { element: canvas }, ...options });

    setApp(application);
    onReady?.(application);

    return () => {
      application.destroy();
      canvas.remove();
      setApp(null);
    };
    // options and onReady are intentionally captured only at mount time.
    // Changing them after mount has no effect — destroy and remount ExoCanvas
    // to apply new options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle: CSSProperties = { position: 'relative', ...style };

  return (
    <ExoContext.Provider value={app}>
      <div ref={containerRef} style={containerStyle} {...divProps}>
        {app !== null && children}
      </div>
    </ExoContext.Provider>
  );
}
