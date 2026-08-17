/// <reference types="@webgpu/types" />

import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';

/**
 * WebGPU's spec-guaranteed defaults for the two limits that bound a storage
 * buffer.
 *
 * These are the values actually in force: a device requested without a
 * `requiredLimits` entry is granted exactly the default, however much the
 * adapter could have offered, and `WebGpuBackend` raises only the texture and
 * sampler limits the batch layout needs. They double as the stand-in for a
 * device that exposes no limits object at all — a conformant device is never
 * granted less, so assuming them is the safe direction.
 */
export const defaultMaxBufferSize = 2 ** 28; // 256 MiB
export const defaultMaxStorageBufferBindingSize = 2 ** 27; // 128 MiB

/**
 * WebGPU's spec default for `maxTextureDimension2D`, the ceiling on either axis
 * of a 2D texture. Same reasoning as the two above: a device that asked for no
 * raise is granted exactly this, and a conformant device is never granted less.
 */
export const WEBGPU_DEFAULT_MAX_TEXTURE_DIMENSION_2D = 8192;

/** The granted limits of `device`, with the spec defaults standing in for a device that exposes none. */
const grantedLimits = (device: GPUDevice): { readonly maxBufferSize: number; readonly maxStorageBufferBindingSize: number } => {
  // Defensive optional access, as in `resolveSpriteBatchTextureSlots`: mocked
  // devices in unit tests may not expose a limits object.
  const limits = (device as { limits?: GPUSupportedLimits }).limits;

  return {
    maxBufferSize: limits?.maxBufferSize ?? defaultMaxBufferSize,
    maxStorageBufferBindingSize: limits?.maxStorageBufferBindingSize ?? defaultMaxStorageBufferBindingSize,
  };
};

/**
 * Bytes the largest storage buffer bound in full may occupy on `device`.
 *
 * Both limits apply to every such buffer: `createBuffer` rejects a size over
 * `maxBufferSize`, and `createBindGroup` rejects a storage binding over
 * `maxStorageBufferBindingSize` — which is the SMALLER of the two defaults, so
 * on a device that asked for neither it is the one that bites.
 * @internal
 */
export const storageBufferLimit = (device: GPUDevice): number => {
  const limits = grantedLimits(device);

  return Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);
};

/** One store's growth target, as the caller's own growth policy computed it. @internal */
export interface StorageGrowthRequest {
  /** Human name of the store, as it should read in the failure message. */
  readonly store: string;
  /** `label` the buffer would have been created with. */
  readonly resource: string;
  /** Rows the caller asked for, BEFORE the growth policy rounded up. */
  readonly requestedRows: number;
  /** Rows the growth policy actually settles on — a power of two at or above `requestedRows`. */
  readonly capacityRows: number;
  /** Bytes `capacityRows` occupy, which is the size of the storage binding. */
  readonly capacityBytes: number;
}

/**
 * Refuse a storage growth the connected device could not bind, before anything
 * is allocated.
 *
 * Measured against the capacity the caller's growth policy SETTLES on rather
 * than the rows it was handed: every store here doubles, so one row over a
 * ceiling asks for twice the bytes, and it is the doubled size that fails.
 * Measured BEFORE the allocation because past the ceiling `createBuffer` still
 * succeeds — the doubled size lands on `maxBufferSize` exactly — and
 * `createBindGroup` does not, which turns the failure into an uncaptured
 * validation error, a root that draws nothing, and a frame loop that keeps
 * running.
 *
 * Unlike the persistent slot store, which answers `canRepresent` and falls back
 * to the streamed path, these stores ARE the fallback: there is no further
 * representation below them, so the honest contract is to fail loudly and
 * typed — the same `RenderError('out-of-memory')` WebGL2 throws when its
 * transform texture outgrows `MAX_TEXTURE_SIZE`.
 * @internal
 */
export const requireRepresentableStorageGrowth = (device: GPUDevice, request: StorageGrowthRequest): void => {
  const limits = grantedLimits(device);
  const limit = Math.min(limits.maxBufferSize, limits.maxStorageBufferBindingSize);

  if (request.capacityBytes <= limit) {
    return;
  }

  // Ties go to the binding limit: it is the smaller of the two defaults and the
  // one that fails later (at bind-group creation rather than allocation), so
  // naming it is the more useful diagnosis when both are breached.
  const binding = limits.maxStorageBufferBindingSize <= limits.maxBufferSize ? 'maxStorageBufferBindingSize' : 'maxBufferSize';
  const rowBytes = request.capacityBytes / request.capacityRows;

  throw new RenderError({
    code: 'out-of-memory',
    backendType: RenderBackendType.WebGpu,
    resource: request.resource,
    message:
      `[ExoJS] ${request.store}: growing to ${request.capacityRows} rows needs a ${request.capacityBytes}-byte storage binding, ` +
      `over this device's granted ${binding} of ${limit}.`,
    detail:
      `Requested ${request.requestedRows} rows; power-of-two growth settles on ${request.capacityRows} rows ` +
      `(${rowBytes} bytes each, ${request.capacityBytes} bytes total). ` +
      `Granted device limits: maxBufferSize ${limits.maxBufferSize}, maxStorageBufferBindingSize ${limits.maxStorageBufferBindingSize}; ` +
      `${binding} binds and caps this store at ${Math.floor(limit / rowBytes)} rows. ` +
      `ExoJS requests neither limit, so a device grants the WebGPU defaults no matter what the adapter could offer.`,
  });
};
