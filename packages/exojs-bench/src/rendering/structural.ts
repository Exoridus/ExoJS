import type { StructuralCounters, StructuralMeasurement } from './EngineAdapter';

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
      for (const restore of restores.splice(0)) {
        restore();
      }
    },
  };
};

/** Render-pass methods that count as a draw call. */
const WEBGPU_DRAW_METHODS = ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect'] as const;

/** Render-pass method that counts as a texture/bind-group bind. */
const WEBGPU_BIND_METHODS = ['setBindGroup'] as const;

/** Queue methods that count as a buffer/texture upload. */
const WEBGPU_UPLOAD_METHODS = ['writeBuffer', 'writeTexture', 'copyExternalImageToTexture'] as const;

/**
 * Wraps the WebGPU submission path - `GPUDevice.createCommandEncoder`, each
 * encoder's `beginRenderPass`, render bundle recording and execution, draw/bind entry points, and the
 * device queue's upload methods - so every draw/bind/upload is tallied into the
 * same engine-agnostic {@link StructuralCounters} the WebGL2 probe fills, then
 * forwarded unchanged.
 *
 * The WebGL2 probe wraps one long-lived context object; the WebGPU submission
 * graph is a chain of *ephemeral* per-frame objects (a fresh encoder each
 * `createCommandEncoder`, a fresh pass each `beginRenderPass`). Those are
 * instrumented in place as they are produced but are NOT restore-tracked:
 * retaining every frame's throwaway encoder/pass just to "restore" a garbage
 * object would leak. Only the persistent objects - the device and its queue -
 * are restore-tracked, and restoring the device's `createCommandEncoder` on
 * {@link StructuralProbe.detach} is what actually stops all further counting:
 * subsequent frames get vanilla, un-instrumented encoders and passes.
 *
 * As in the WebGL2 probe, every wrapper forwards with `this` and args preserved
 * (`fn.apply(this, args)`) and returns the original return value; the
 * return-wrapping methods instrument their result object in place, so callers
 * keep object identity.
 */
export const attachWebGpuProbe = (device: GPUDevice): StructuralProbe => {
  const counters: StructuralCounters = { drawCalls: 0, textureBinds: 0, bufferUploads: 0 };
  const restores: Array<() => void> = [];
  const bundles = new WeakMap<object, { drawCalls: number; textureBinds: number }>();

  /** Replace `target[methodName]` with a wrapper that tallies via `bump`, then forwards unchanged. */
  const countOn = (target: Record<string, unknown>, methodName: string, bump: () => void, track: boolean): void => {
    const original = target[methodName];

    if (typeof original !== 'function') {
      return;
    }

    target[methodName] = function wrapped(this: unknown, ...args: unknown[]) {
      bump();

      return (original as (...fnArgs: unknown[]) => unknown).apply(this, args);
    };

    if (track) {
      restores.push(() => {
        target[methodName] = original;
      });
    }
  };

  /** Replace `target[methodName]` with a wrapper that forwards, then hands the return value to `onResult`. */
  const wrapReturn = (target: Record<string, unknown>, methodName: string, onResult: (result: unknown) => void, track: boolean): void => {
    const original = target[methodName];

    if (typeof original !== 'function') {
      return;
    }

    target[methodName] = function wrapped(this: unknown, ...args: unknown[]) {
      const result = (original as (...fnArgs: unknown[]) => unknown).apply(this, args);

      onResult(result);

      return result;
    };

    if (track) {
      restores.push(() => {
        target[methodName] = original;
      });
    }
  };

  const instrumentPass = (pass: Record<string, unknown>): void => {
    const executeBundles = pass.executeBundles;

    if (typeof executeBundles === 'function') {
      pass.executeBundles = function wrapped(this: unknown, ...args: unknown[]) {
        const executedBundles = Array.isArray(args[0]) ? args[0] : [...(args[0] as Iterable<object>)];

        args[0] = executedBundles;

        for (const bundle of executedBundles) {
          const counts = bundles.get(bundle);

          if (counts) {
            counters.drawCalls += counts.drawCalls;
            counters.textureBinds += counts.textureBinds;
          }
        }

        return (executeBundles as (...fnArgs: unknown[]) => unknown).apply(this, args);
      };
    }

    for (const methodName of WEBGPU_DRAW_METHODS) {
      countOn(pass, methodName, () => (counters.drawCalls += 1), false);
    }

    for (const methodName of WEBGPU_BIND_METHODS) {
      countOn(pass, methodName, () => (counters.textureBinds += 1), false);
    }
  };

  const instrumentEncoder = (encoder: Record<string, unknown>): void => {
    wrapReturn(encoder, 'beginRenderPass', pass => instrumentPass(pass as Record<string, unknown>), false);
  };

  wrapReturn(
    device as unknown as Record<string, unknown>,
    'createRenderBundleEncoder',
    result => {
      const encoder = result as Record<string, unknown>;
      const counts = { drawCalls: 0, textureBinds: 0 };

      for (const methodName of WEBGPU_DRAW_METHODS) {
        countOn(encoder, methodName, () => (counts.drawCalls += 1), false);
      }

      for (const methodName of WEBGPU_BIND_METHODS) {
        countOn(encoder, methodName, () => (counts.textureBinds += 1), false);
      }

      wrapReturn(encoder, 'finish', bundle => bundles.set(bundle as object, counts), false);
    },
    true,
  );

  wrapReturn(
    device as unknown as Record<string, unknown>,
    'createCommandEncoder',
    encoder => instrumentEncoder(encoder as Record<string, unknown>),
    true,
  );

  const queue = (device as unknown as { queue: Record<string, unknown> }).queue;

  for (const methodName of WEBGPU_UPLOAD_METHODS) {
    countOn(queue, methodName, () => (counters.bufferUploads += 1), true);
  }

  return {
    counters,
    reset(): void {
      counters.drawCalls = 0;
      counters.textureBinds = 0;
      counters.bufferUploads = 0;
    },
    detach(): void {
      for (const restore of restores.splice(0)) {
        restore();
      }
    },
  };
};

/** Preserve the raw totals and disclose whether the report contains exact per-frame counts or whole-window totals. */
export const summarizeStructuralCounters = (
  totals: StructuralCounters,
  frames: number,
): { structural: StructuralCounters; structuralMeasurement: StructuralMeasurement; note: string | null } => {
  const perFrame = {
    drawCalls: totals.drawCalls / frames,
    textureBinds: totals.textureBinds / frames,
    bufferUploads: totals.bufferUploads / frames,
  };
  const even = Object.values(perFrame).every(Number.isInteger);
  const raw = { ...totals };

  return {
    structural: even ? perFrame : raw,
    structuralMeasurement: { schemaVersion: 1, basis: even ? 'per-frame' : 'total', frames, totals: raw },
    note: even ? null : `structural counters did not divide evenly over ${frames} frame(s); raw totals reported`,
  };
};
