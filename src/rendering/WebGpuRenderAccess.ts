/// <reference types="@webgpu/types" />

export interface WebGpuRenderAccess {
    readonly device: GPUDevice;
    readonly context: GPUCanvasContext;
    readonly format: GPUTextureFormat;
}
