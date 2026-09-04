import type { GpuTimer } from '#rendering/GpuTimer';

/** The surface of `EXT_disjoint_timer_query_webgl2` this timer consumes. */
interface DisjointTimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * GPU frame timer backed by `EXT_disjoint_timer_query_webgl2`, or `null` when
 * the context does not expose it - browsers gate the extension behind a privacy
 * policy, so its absence is the common case rather than an error.
 *
 * One `TIME_ELAPSED` query brackets the whole frame's GL command stream, which
 * makes the result directly comparable to the CPU frame time and, unlike the
 * WebGPU timestamp path, includes the frame's uploads. Results resolve a frame
 * or more later, so each frame opens a query and publishes whichever earlier
 * queries have since become available.
 *
 * Every GL call is guarded: a failing extension disables the timer for the rest
 * of the session rather than throwing out of the render loop, since a
 * diagnostic instrument must never be able to break the frame it measures.
 * @internal
 */
export const createWebGl2GpuTimer = (gl: WebGL2RenderingContext): GpuTimer | null => {
  let extension: DisjointTimerExtension | null;

  try {
    extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as DisjointTimerExtension | null;
  } catch {
    extension = null;
  }

  if (extension === null) {
    return null;
  }

  const timeElapsedTarget = extension.TIME_ELAPSED_EXT;
  const disjointParam = extension.GPU_DISJOINT_EXT;
  const pending: WebGLQuery[] = [];

  let active: WebGLQuery | null = null;
  let lastFrameMs: number | null = null;
  let failed = false;

  const discard = (): void => {
    for (const query of pending) {
      gl.deleteQuery(query);
    }

    pending.length = 0;
    active = null;
  };

  const fail = (): void => {
    failed = true;
    lastFrameMs = null;

    try {
      discard();
    } catch {
      pending.length = 0;
      active = null;
    }
  };

  const drain = (): void => {
    while (pending.length > 0) {
      const query = pending[0]!;

      if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) !== true) {
        return;
      }

      const disjoint = gl.getParameter(disjointParam) === true;

      pending.shift();

      // A disjoint interval means the GPU clock was interrupted (throttling, a
      // context switch), so the elapsed value describes nothing that happened in
      // this frame. Drop it rather than publish noise.
      if (!disjoint) {
        lastFrameMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      }

      gl.deleteQuery(query);
    }
  };

  return {
    get lastFrameMs(): number | null {
      return lastFrameMs;
    },
    beginFrame(): void {
      if (failed) {
        return;
      }

      try {
        const query = gl.createQuery();

        if (query === null) {
          return;
        }

        active = query;
        gl.beginQuery(timeElapsedTarget, query);
      } catch {
        fail();
      }
    },
    endFrame(): void {
      if (failed || active === null) {
        return;
      }

      try {
        gl.endQuery(timeElapsedTarget);
        pending.push(active);
        active = null;
        drain();
      } catch {
        fail();
      }
    },
    destroy(): void {
      failed = true;

      try {
        if (active !== null) {
          gl.endQuery(timeElapsedTarget);
          pending.push(active);
        }

        discard();
      } catch {
        pending.length = 0;
        active = null;
      }
    },
  };
};
