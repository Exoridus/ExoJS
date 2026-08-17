import type { InternalTargetRecord, ProbeMode } from './matrix';

/**
 * Bench-only instrumentation and A/B hook for the `NEU-S4` probe.
 *
 * Both halves work by shadowing a method ON AN INSTANCE the probe itself
 * constructed — the live backend and the probe's own `cacheAsBitmap` node —
 * never by touching a prototype and never by changing engine source. The engine
 * keeps its own contract: `RenderEffectExecutor` still passes LOGICAL barrier
 * bounds to `_renderPlanRenderToTexture` / `_renderPlanDrawTexture`, so a larger
 * texture is rendered through the same logical `View` (supersampled) and
 * composited back at the same logical size. Nothing downstream of the
 * allocation is aware of the change.
 *
 * This is a measurement device, not a fix. It answers "what would the
 * correction cost", and it deliberately has no way to reach production code.
 */

/** Minimal structural surface of a render backend this module patches. */
export interface RenderTextureAcquirer {
  acquireRenderTexture(width: number, height: number): unknown;
}

/** Minimal structural surface of a `cacheAsBitmap` node this module patches. */
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

/**
 * Target-size multiplier for a cell.
 *
 * `current` is exactly 1 — the production contract, byte for byte. The probe arm
 * multiplies by the parent surface's effective resolution, which is the sizing
 * rule the audit says an internal target would need in order to match the main
 * surface texel for texel.
 */
export const resolveProbeScale = (mode: ProbeMode, pixelRatio: number): number => (mode === 'current' ? 1 : pixelRatio);

/**
 * Scale one axis of a requested target size.
 *
 * Rounded (not floored) so a 1.5× probe of a 201-unit bound lands on 302 rather
 * than 301, and clamped at 1 so a degenerate bound can never ask for a zero-size
 * texture.
 */
export const scaleTargetSize = (size: number, scale: number): number => Math.max(1, Math.round(size * scale));

/** One target allocation as it happened. */
export interface TargetAllocation {
  readonly kind: InternalTargetRecord['kind'];
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly actualWidth: number;
  readonly actualHeight: number;
}

/**
 * Collects internal-target allocations while ARMED.
 *
 * Arming is per frame rather than per cell on purpose: an effect target is
 * acquired again every frame, so recording the whole measured window would
 * produce a count that is really a frame count in disguise. The probe arms the
 * recorder for exactly one frame, so `count` reads as "per frame" — which is the
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
const allocationKey = (allocation: TargetAllocation): string =>
  `${allocation.kind}|${allocation.logicalWidth}x${allocation.logicalHeight}|${allocation.actualWidth}x${allocation.actualHeight}`;

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
          logicalWidth: allocation.logicalWidth,
          logicalHeight: allocation.logicalHeight,
          actualWidth: allocation.actualWidth,
          actualHeight: allocation.actualHeight,
          count: (existing?.count ?? 0) + 1,
        });
      }

      return [...byShape.values()];
    },
  };
};

/**
 * Shadow `acquireRenderTexture` on ONE backend instance so every pooled effect
 * target (filter input, each filter output, mask targets) is recorded and, in
 * probe mode, allocated at `scale ×` the size the engine asked for.
 *
 * The pool is keyed by the size it is handed, so a probe-mode cell simply pools
 * larger textures; `releaseRenderTexture` needs no counterpart.
 */
export const instrumentAcquireRenderTexture = (backend: RenderTextureAcquirer, recorder: TargetRecorder, scale: number): RestoreInstrumentation => {
  const original = backend.acquireRenderTexture.bind(backend);

  return shadowMethod(backend, 'acquireRenderTexture', ((width: number, height: number): unknown => {
    const actualWidth = scaleTargetSize(width, scale);
    const actualHeight = scaleTargetSize(height, scale);

    recorder.record({ kind: 'pooled', logicalWidth: width, logicalHeight: height, actualWidth, actualHeight });

    return original(actualWidth, actualHeight);
  }) as (...args: never[]) => unknown);
};

/**
 * Shadow `_renderPlanEnsureCacheTexture` on ONE node so its `cacheAsBitmap`
 * texture is recorded and, in probe mode, sized at `scale ×` the logical bounds.
 *
 * The node's cache BOUNDS stay logical — the engine stores them from the
 * barrier, not from the texture — so `_renderPlanCanReuseBitmapCache` and the
 * replay draw are unaffected and the cache still invalidates on exactly the same
 * conditions.
 */
export const instrumentCacheTexture = (node: CacheTextureOwner, recorder: TargetRecorder, scale: number): RestoreInstrumentation => {
  const original = node._renderPlanEnsureCacheTexture.bind(node);

  return shadowMethod(node, '_renderPlanEnsureCacheTexture', ((width: number, height: number): unknown => {
    const actualWidth = scaleTargetSize(width, scale);
    const actualHeight = scaleTargetSize(height, scale);

    recorder.record({ kind: 'cache', logicalWidth: width, logicalHeight: height, actualWidth, actualHeight });

    return original(actualWidth, actualHeight);
  }) as (...args: never[]) => unknown);
};
