// @codexo/exojs/rendering — curated rendering-author surface.
// Advanced symbols for renderer authors, backend authors, and official
// extension packages. Prefer the root barrel for ordinary application code.

export { Drawable } from './rendering/Drawable';
export type { RenderBackend } from './rendering/RenderBackend';
export { RenderBackendType } from './rendering/RenderBackendType';
export type { DrawableConstructor, Renderer } from './rendering/Renderer';
export { RendererRegistry } from './rendering/RendererRegistry';
export type { RenderPlanBuilder } from './rendering/plan/RenderPlanBuilder';
export type { ShaderProgram } from './rendering/shader/Shader';
export { Shader } from './rendering/shader/Shader';
export { Spritesheet } from './rendering/sprite/Spritesheet';
export { Texture } from './rendering/texture/Texture';
export { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from './rendering/types';
export { View } from './rendering/View';
export { AbstractWebGl2BatchedRenderer } from './rendering/webgl2/AbstractWebGl2BatchedRenderer';
export { AbstractWebGl2Renderer } from './rendering/webgl2/AbstractWebGl2Renderer';
export { WebGl2Backend } from './rendering/webgl2/WebGl2Backend';
export type { WebGl2RenderBufferRuntime } from './rendering/webgl2/WebGl2RenderBuffer';
export { WebGl2RenderBuffer } from './rendering/webgl2/WebGl2RenderBuffer';
export { WebGl2ShaderBlock } from './rendering/webgl2/WebGl2ShaderBlock';
export { createWebGl2ShaderProgram } from './rendering/webgl2/WebGl2ShaderProgram';
export type { WebGl2VertexArrayObjectRuntime } from './rendering/webgl2/WebGl2VertexArrayObject';
export { WebGl2VertexArrayObject } from './rendering/webgl2/WebGl2VertexArrayObject';
export { AbstractWebGpuRenderer } from './rendering/webgpu/AbstractWebGpuRenderer';
export type { ComputeBinding } from './rendering/webgpu/compute';
export { WebGpuComputePipeline, WebGpuStorageBuffer } from './rendering/webgpu/compute';
export { WebGpuBackend } from './rendering/webgpu/WebGpuBackend';
export { getWebGpuBlendState } from './rendering/webgpu/WebGpuBlendState';
export { stencilContentDepthStencilState } from './rendering/webgpu/WebGpuStencilState';
