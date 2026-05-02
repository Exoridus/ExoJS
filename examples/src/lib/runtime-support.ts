import type { AutoRendererStatus, Example, ExampleAvailability, ExampleBackend } from './types';

let _autoRendererStatus: AutoRendererStatus = 'checking';
let _webgpuSupported = false;
let _webgl2Supported = false;

const _listeners = new Set<() => void>();

export function getAutoRendererStatus(): AutoRendererStatus {
  return _autoRendererStatus;
}

export function isWebGpuSupported(): boolean {
  return _webgpuSupported;
}

export function isWebGl2Supported(): boolean {
  return _webgl2Supported;
}

export function onRuntimeDetected(callback: () => void): () => void {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}

export function getExampleAvailability(example: Example | null): ExampleAvailability {
  if (!example) {
    return { available: true, reason: null };
  }

  return getAvailabilityForBackend(example.backend);
}

export function getAvailabilityForBackend(backend: ExampleBackend): ExampleAvailability {
  if (_autoRendererStatus === 'checking') {
    return { available: true, reason: null };
  }

  switch (backend) {
    case 'core':
      return _autoRendererStatus === 'unsupported'
        ? { available: false, reason: 'Requires WebGPU or WebGL2 support.' }
        : { available: true, reason: null };
    case 'webgl2':
      return _webgl2Supported
        ? { available: true, reason: null }
        : { available: false, reason: 'Requires WebGL2 support.' };
    case 'webgpu':
      return _webgpuSupported
        ? { available: true, reason: null }
        : { available: false, reason: 'Requires WebGPU support.' };
    case 'advanced':
      return _webgpuSupported
        ? { available: true, reason: null }
        : { available: false, reason: 'Requires advanced WebGPU support.' };
    default:
      return { available: true, reason: null };
  }
}

async function detectWebGpuSupport(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;

    if (!gpu || typeof gpu.requestAdapter !== 'function') {
      return false;
    }

    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function detectWebGl2Support(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

export async function detectRuntimeSupport(): Promise<void> {
  _webgpuSupported = await detectWebGpuSupport();
  _webgl2Supported = detectWebGl2Support();
  _autoRendererStatus = _webgpuSupported ? 'webgpu' : _webgl2Supported ? 'webgl2' : 'unsupported';

  for (const listener of _listeners) {
    listener();
  }
}
