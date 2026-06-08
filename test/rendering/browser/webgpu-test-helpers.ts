import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

export interface BrowserWebGpuTestContext {
  skip: (reason: string) => void;
}

const missingDeviceReason = 'WebGPU unavailable: backend has no device';
const uninitializedDeviceMessage = 'WebGPU device is not initialized yet.';

export const getBackendDeviceOrSkip = (ctx: BrowserWebGpuTestContext, backend: WebGpuBackend): GPUDevice | null => {
  try {
    const device = backend.device as GPUDevice | undefined;

    if (!device) {
      ctx.skip(missingDeviceReason);

      return null;
    }

    return device;
  } catch (error) {
    if (error instanceof Error && error.message === uninitializedDeviceMessage) {
      ctx.skip(missingDeviceReason);

      return null;
    }

    throw error;
  }
};
