import { Capabilities } from '@codexo/exojs';

import type { Capability } from './examples-catalog';
import type { AutoRendererStatus, Example, ExampleAvailability, ExampleBackend } from './types';

let _autoRendererStatus: AutoRendererStatus = 'checking';
let _webgpuSupported = false;
let _webgl2Supported = false;
let _capabilitySnapshot: Record<Capability, boolean> | null = null;

const _listeners = new Set<() => void>();

export const getAutoRendererStatus = (): AutoRendererStatus => {
  return _autoRendererStatus;
};

export const isWebGpuSupported = (): boolean => {
  return _webgpuSupported;
};

export const isWebGl2Supported = (): boolean => {
  return _webgl2Supported;
};

export const onRuntimeDetected = (callback: () => void): (() => void) => {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
};

export const getExampleAvailability = (example: Example | null): ExampleAvailability => {
  if (!example) {
    return { available: true, reason: null };
  }

  return getAvailabilityForBackend(example.backend);
};

export const getAvailabilityForBackend = (backend: ExampleBackend): ExampleAvailability => {
  if (_autoRendererStatus === 'checking') {
    return { available: true, reason: null };
  }

  switch (backend) {
    case 'core':
      return _autoRendererStatus === 'unsupported' ? { available: false, reason: 'Requires WebGPU or WebGL2 support.' } : { available: true, reason: null };
    case 'webgl2':
      return _webgl2Supported ? { available: true, reason: null } : { available: false, reason: 'Requires WebGL2 support.' };
    case 'webgpu':
      return _webgpuSupported ? { available: true, reason: null } : { available: false, reason: 'Requires WebGPU support.' };
    case 'advanced':
      return _webgpuSupported ? { available: true, reason: null } : { available: false, reason: 'Requires advanced WebGPU support.' };
    default:
      return { available: true, reason: null };
  }
};

export const detectRuntimeSupport = async (): Promise<void> => {
  // Capabilities.ready does the WebGL2 context probe + the async WebGPU
  // adapter check in one shot. `webgpuAdapter !== null` is the strict
  // "real adapter is available" signal - `caps.webgpu` alone only confirms
  // the API surface and would over-report support on browsers where the
  // adapter request fails (blacklisted GPU, headless without software).
  const caps = await Capabilities.ready;

  _webgpuSupported = caps.webgpuAdapter !== null;
  _webgl2Supported = caps.webgl2;
  if (_webgpuSupported) {
    _autoRendererStatus = 'webgpu';
  } else if (_webgl2Supported) {
    _autoRendererStatus = 'webgl2';
  } else {
    _autoRendererStatus = 'unsupported';
  }

  _capabilitySnapshot = {
    webgl2: caps.webgl2,
    // Use the strict "real adapter" signal so headless / blacklisted-GPU
    // browsers don't claim webgpu support purely on the API surface.
    webgpu: caps.webgpuAdapter !== null,
    pointer: caps.pointer,
    keyboard: caps.keyboard,
    gamepad: caps.gamepad,
    touch: caps.touch,
    audio: caps.audio,
    fullscreen: caps.fullscreen,
    vibration: caps.vibration,
    offscreenCanvas: caps.offscreenCanvas,
    webWorkers: caps.webWorkers,
  };

  for (const listener of _listeners) {
    listener();
  }
};

/**
 * Returns the resolved capability snapshot, or `null` if
 * {@link detectRuntimeSupport} hasn't run yet. Read-only.
 */
export const getCapabilitySnapshot = (): Readonly<Record<Capability, boolean>> | null => {
  return _capabilitySnapshot;
};

/**
 * Filters `required` to the subset that is currently `false` in the
 * snapshot. Returns `null` while detection is still in progress (caller
 * should treat as "not yet known"). Returns an empty array when all
 * required capabilities are met.
 */
export const getMissingCapabilities = (required: ReadonlyArray<Capability>): ReadonlyArray<Capability> | null => {
  if (_capabilitySnapshot === null) return null;
  return required.filter(cap => !_capabilitySnapshot![cap]);
};
