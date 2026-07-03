import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

/**
 * Returns the backend's WebGPU device.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe), so a missing device is a genuine test failure, not
 * an environment gap — this throws (via the `device` getter) rather than
 * skipping.
 */
export const getBackendDevice = (backend: WebGpuBackend): GPUDevice => backend.device;
