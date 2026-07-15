// @codexo/exojs/renderer-sdk — curated backend-author surface.
// Advanced symbols for renderer and backend authors (abstract renderers, render
// backends, low-level GL/GPU building blocks). Ordinary application code should
// import from the root `@codexo/exojs` barrel; these symbols are intentionally
// kept out of it (see src/rendering/public.ts).
//
// Custom renderers extend the ABSTRACT renderers below (AbstractWebGl2Renderer /
// AbstractWebGl2BatchedRenderer / AbstractWebGpuRenderer) — the subclass-stable
// contract used by the exojs-particles and exojs-tilemap packages. The engine's
// built-in CONCRETE renderers (WebGl2SpriteRenderer, WebGpuMeshRenderer, …) are
// internal and intentionally NOT exported here: they are coupled to internal
// sprite/mesh data paths and are not a stable subclassing surface pre-1.0.

export { packAffineMat4 } from '#rendering/affinePacking';
export { Drawable } from '#rendering/Drawable';
export type { PixelSnapMode } from '#rendering/pixelSnap';
export type { RenderPlanBuilder } from '#rendering/plan/RenderPlanBuilder';
export type { RetainedGroupBundle } from '#rendering/plan/RetainedInstructionSet';
export type { RenderBackend } from '#rendering/RenderBackend';
export { RenderBackendType } from '#rendering/RenderBackendType';
export type { DrawableConstructor, Renderer } from '#rendering/Renderer';
export { RendererRegistry } from '#rendering/RendererRegistry';
export type { ShaderProgram } from '#rendering/shader/Shader';
export { Shader } from '#rendering/shader/Shader';
export { Spritesheet } from '#rendering/sprite/Spritesheet';
export { RenderTexture } from '#rendering/texture/RenderTexture';
export { Texture } from '#rendering/texture/Texture';
export { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
export { View } from '#rendering/View';
export { AbstractWebGl2BatchedRenderer } from '#rendering/webgl2/AbstractWebGl2BatchedRenderer';
export { AbstractWebGl2Renderer } from '#rendering/webgl2/AbstractWebGl2Renderer';
export { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
export type { WebGl2RenderBufferRuntime } from '#rendering/webgl2/WebGl2RenderBuffer';
export { WebGl2RenderBuffer } from '#rendering/webgl2/WebGl2RenderBuffer';
export type {
  WebGl2RetainedBatchPayload,
  WebGl2RetainedBatchReplayer,
  WebGl2RetainedGeometryRef,
  WebGl2RetainedNodeIndexRange,
} from '#rendering/webgl2/WebGl2RetainedGroupResources';
export { WebGl2ShaderBlock } from '#rendering/webgl2/WebGl2ShaderBlock';
export { createWebGl2ShaderProgram } from '#rendering/webgl2/WebGl2ShaderProgram';
export type { WebGl2VertexArrayObjectRuntime } from '#rendering/webgl2/WebGl2VertexArrayObject';
export { WebGl2VertexArrayObject } from '#rendering/webgl2/WebGl2VertexArrayObject';
export { AbstractWebGpuRenderer } from '#rendering/webgpu/AbstractWebGpuRenderer';
export type { ComputeBinding } from '#rendering/webgpu/compute/index';
export { WebGpuComputePipeline, WebGpuStorageBuffer } from '#rendering/webgpu/compute/index';
export { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';
export { getWebGpuBlendState } from '#rendering/webgpu/WebGpuBlendState';
export type { WebGpuActiveRenderPass } from '#rendering/webgpu/WebGpuPassCoordinator';
export {
  retainedGroupUniformBytes,
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedGeometryRef,
  type WebGpuRetainedNodeIndexRange,
} from '#rendering/webgpu/WebGpuRetainedGroupResources';
export { stencilContentDepthStencilState } from '#rendering/webgpu/WebGpuStencilState';
