import type { StructuralCounters } from '../EngineAdapter';

/** Live handle on the structural counters gathered from a wrapped graphics context. */
export interface StructuralProbe {
  /** Draw-call and state-change counters accumulated since the last {@link reset}. */
  readonly counters: StructuralCounters;
  /** Zeroes all counters without detaching the wrappers. */
  reset(): void;
  /** Restores the original context methods, ending all counting. */
  detach(): void;
}

/** Names of the context methods that count as a draw call. */
const DRAW_METHODS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const;

/** Names of the context methods that count as a texture bind. */
const TEXTURE_BIND_METHODS = ['bindTexture'] as const;

/** Names of the context methods that count as a buffer/texture upload. */
const BUFFER_UPLOAD_METHODS = ['bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D'] as const;

/**
 * Wraps the draw/bind/upload entry points on a live WebGL2 context so every call is tallied
 * into engine-agnostic {@link StructuralCounters}, then forwarded unchanged to the original
 * implementation. Proxying the context rather than reading engine-reported stats lets every
 * benchmark arm be measured with the same ruler.
 */
export const attachWebGl2Probe = (gl: WebGL2RenderingContext): StructuralProbe => {
  const counters: StructuralCounters = { drawCalls: 0, textureBinds: 0, bufferUploads: 0 };
  const restores: Array<() => void> = [];

  const wrap = (methodName: string, onCall: () => void): void => {
    const target = gl as unknown as Record<string, unknown>;
    const original = target[methodName];

    if (typeof original !== 'function') {
      return;
    }

    target[methodName] = function wrapped(this: unknown, ...args: unknown[]) {
      onCall();
      return (original as (...fnArgs: unknown[]) => unknown).apply(this, args);
    };

    restores.push(() => {
      target[methodName] = original;
    });
  };

  for (const methodName of DRAW_METHODS) {
    wrap(methodName, () => {
      counters.drawCalls += 1;
    });
  }

  for (const methodName of TEXTURE_BIND_METHODS) {
    wrap(methodName, () => {
      counters.textureBinds += 1;
    });
  }

  for (const methodName of BUFFER_UPLOAD_METHODS) {
    wrap(methodName, () => {
      counters.bufferUploads += 1;
    });
  }

  return {
    counters,
    reset(): void {
      counters.drawCalls = 0;
      counters.textureBinds = 0;
      counters.bufferUploads = 0;
    },
    detach(): void {
      for (const restore of restores.splice(0, restores.length)) {
        restore();
      }
    },
  };
};
