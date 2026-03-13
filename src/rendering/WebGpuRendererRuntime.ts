/// <reference types="@webgpu/types" />

import type { RenderBackendType } from './RenderBackendType';
import type { SceneRenderRuntime } from './SceneRenderRuntime';

export interface WebGpuRendererRuntime extends SceneRenderRuntime {
    readonly backendType: RenderBackendType.WebGpu;
    readonly device: GPUDevice;
    readonly context: GPUCanvasContext;
    readonly format: GPUTextureFormat;
}
