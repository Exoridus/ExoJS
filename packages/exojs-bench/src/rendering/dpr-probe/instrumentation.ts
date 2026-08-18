import type { InternalTargetRecord } from './matrix';

/**
 * Internal-target instrumentation for the DPR probe.
 *
 * RECORDING ONLY. Until internal targets began inheriting the surface resolution,
 * this module also SIZED them: it
 * shadowed the allocation calls so they handed back `logical × pixelRatio`
 * textures, which is how the correction was priced before it existed. That half
 * is gone - the engine sizes its own targets now, and the probe's two arms are
 * ordinary `Filter.resolution` / `RenderNode.cacheResolution` settings.
 *
 * What remains is the observation: a shadow on the probe's OWN backend and node
 * instances that records the size the engine asked for. Nothing here changes
 * what is allocated, so every cell measures the production path exactly.
 *
 * There is deliberately no "logical size" column any more. The logical bounds
 * are a property of the scene, not of an allocation, and the probe measures them
 * directly: the `logical` arm pins every target to resolution 1, so its recorded
 * sizes ARE the logical bounds.
 */

/** Minimal structural surface of a render backend this module patches. */
export interface RenderTextureAcquirer {
  acquireRenderTexture(width: number, height: number): unknown;
}

/** Minimal structural surface of a `cacheAsTexture` node this module patches. */
export interface CacheTextureOwner {
  _renderPlanEnsureCacheTexture(width: number, height: number): unknown;
}

/** Undo handle returned by every instrumenting call. */
export type RestoreInstrumentation = () => void;

/**
 * Shadow one method on one object and hand back a faithful undo.
 *
 * "Faithful" is the whole point: on a real backend the method lives on the
 * PROTOTYPE, so undoing means deleting the own property the shadow created; on
 * an object that owned the method directly, deleting it would remove the method
 * altogether. Restoring the wrong way leaves the next cell running against a
 * crippled object, and the resulting failure would look like an engine bug.
 */
const shadowMethod = (target: object, name: string, replacement: (...args: never[]) => unknown): RestoreInstrumentation => {
  const owner = target as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(owner, name);

  owner[name] = replacement;

  return (): void => {
    if (descriptor === undefined) {
      delete owner[name];

      return;
    }

    Object.defineProperty(owner, name, descriptor);
  };
};

/** One target allocation as it happened. */
export interface TargetAllocation {
  readonly kind: InternalTargetRecord['kind'];
  readonly width: number;
  readonly height: number;
}

/**
 * Collects internal-target allocations while ARMED.
 *
 * Arming is per frame rather than per cell on purpose: an effect target is
 * acquired again every frame, so recording the whole measured window would
 * produce a count that is really a frame count in disguise. The probe arms the
 * recorder for exactly one frame, so `count` reads as "per frame" - which is the
 * figure that multiplies into a cost.
 */
export interface TargetRecorder {
  readonly armed: boolean;
  /** Start recording; clears anything recorded before. */
  arm(): void;
  /** Stop recording, keeping what was captured. */
  disarm(): void;
  /** Record one allocation. A no-op while disarmed. */
  record(allocation: TargetAllocation): void;
  /** Distinct target shapes captured, with how often each was allocated. */
  summary(): InternalTargetRecord[];
}

/** Key that makes two allocations the same shape for the summary. */
const allocationKey = (allocation: TargetAllocation): string => `${allocation.kind}|${allocation.width}x${allocation.height}`;

export const createTargetRecorder = (): TargetRecorder => {
  let armed = false;
  let captured: TargetAllocation[] = [];

  return {
    get armed(): boolean {
      return armed;
    },
    arm(): void {
      captured = [];
      armed = true;
    },
    disarm(): void {
      armed = false;
    },
    record(allocation: TargetAllocation): void {
      if (armed) {
        captured.push(allocation);
      }
    },
    summary(): InternalTargetRecord[] {
      const byShape = new Map<string, InternalTargetRecord>();

      for (const allocation of captured) {
        const key = allocationKey(allocation);
        const existing = byShape.get(key);

        byShape.set(key, {
          kind: allocation.kind,
          width: allocation.width,
          height: allocation.height,
          count: (existing?.count ?? 0) + 1,
        });
      }

      return [...byShape.values()];
    },
  };
};

/**
 * Record every pooled effect target the backend hands out - filter input, each
 * filter output, mask targets.
 */
export const instrumentAcquireRenderTexture = (backend: RenderTextureAcquirer, recorder: TargetRecorder): RestoreInstrumentation => {
  const original = backend.acquireRenderTexture.bind(backend);

  return shadowMethod(backend, 'acquireRenderTexture', ((width: number, height: number): unknown => {
    recorder.record({ kind: 'pooled', width, height });

    return original(width, height);
  }) as (...args: never[]) => unknown);
};

/** Record the node-owned `cacheAsTexture` texture as the engine sizes it. */
export const instrumentCacheTexture = (node: CacheTextureOwner, recorder: TargetRecorder): RestoreInstrumentation => {
  const original = node._renderPlanEnsureCacheTexture.bind(node);

  return shadowMethod(node, '_renderPlanEnsureCacheTexture', ((width: number, height: number): unknown => {
    recorder.record({ kind: 'cache', width, height });

    return original(width, height);
  }) as (...args: never[]) => unknown);
};
