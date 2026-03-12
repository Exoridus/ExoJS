/// <reference types="@webgpu/types" />

export interface IWebGpuRenderAccess {
    readonly device: GPUDevice;
    readonly context: GPUCanvasContext;
    readonly format: GPUTextureFormat;
}
