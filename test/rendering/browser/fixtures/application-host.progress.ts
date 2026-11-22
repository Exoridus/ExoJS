export interface WorkerProgress {
  readonly kind: 'progress';
  readonly phase:
    | 'module-evaluation'
    | 'init'
    | 'webgl2-context'
    | 'application-construction'
    | 'application-start'
    | 'render'
    | 'pixel-readback'
    | 'teardown';
  readonly edge: 'start' | 'end';
  readonly at: number;
  readonly contexts: number;
}

let contexts = 0;

export const progress = (phase: WorkerProgress['phase'], edge: WorkerProgress['edge']): void => {
  self.postMessage({ kind: 'progress', phase, edge, at: performance.timeOrigin + performance.now(), contexts } satisfies WorkerProgress);
};

// Import this ahead of the engine graph so a worker that reaches evaluation can report it.
progress('module-evaluation', 'start');

export const traceWebGl2Contexts = (): (() => void) => {
  const getContext = OffscreenCanvas.prototype.getContext;
  const seen = new WeakSet<object>();

  OffscreenCanvas.prototype.getContext = function (this: OffscreenCanvas, ...args: unknown[]) {
    if (args[0] !== 'webgl2') {
      return Reflect.apply(getContext, this, args);
    }

    progress('webgl2-context', 'start');

    try {
      const context = Reflect.apply(getContext, this, args) as WebGL2RenderingContext | null;

      if (context !== null && !seen.has(context)) {
        seen.add(context);
        contexts++;
      }

      return context;
    } finally {
      progress('webgl2-context', 'end');
    }
  } as typeof getContext;

  return () => {
    OffscreenCanvas.prototype.getContext = getContext;
  };
};
