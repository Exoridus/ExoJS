/// <reference types="@webgpu/types" />

// @codexo/exojs application-facing rendering surface. Re-exported by the root
// barrel (`src/index.ts`). Backend/renderer-author internals (abstract renderers,
// concrete backend renderers, VAOs, shader programs, glyph/text layout helpers)
// are intentionally NOT here - they live in their own modules under
// `#rendering/**` and, for the curated public author surface, in
// `@codexo/exojs/renderer-sdk`.

export type { BackendRenderPass } from './BackendRenderPass';
export type { CallbackRenderPassOptions } from './CallbackRenderPass';
export { CallbackRenderPass } from './CallbackRenderPass';
export { Container } from './Container';
export { Drawable } from './Drawable';
export type { DrawContext, RenderToOptions } from './DrawContext';
export type { MultiRenderTargetOptions } from './MultiRenderTarget';
export { MultiRenderTarget } from './MultiRenderTarget';
export { PassContext } from './PassContext';
export { PixelSnapMode } from './pixelSnap';
export { RenderBackendType } from './RenderBackendType';
export { RenderBatch } from './RenderBatch';
export type { RenderErrorCode, RenderErrorOptions } from './RenderError';
export { formatShaderError, RenderError } from './RenderError';
export type { CaptureOptions, DrawBatchOptions, DrawGeometryOptions, RenderOptions } from './RenderingContext';
export { RenderingContext } from './RenderingContext';
export type { MaskSource } from './RenderNode';
export { RenderNode } from './RenderNode';
export type { RenderNodePassOptions } from './RenderNodePass';
export { RenderNodePass } from './RenderNodePass';
export type { RenderPassOptions } from './RenderPass';
export { RenderPass } from './RenderPass';
export { RenderPipeline } from './RenderPipeline';
export type { RenderStats } from './RenderStats';
export { createRenderStats, resetRenderStats } from './RenderStats';
export { RenderTarget } from './RenderTarget';
export { RetainedContainer } from './RetainedContainer';
export type { ColorTextureFormat } from './types';
export {
  BlendModes,
  BufferTypes,
  BufferUsage,
  isAdvancedBlendMode,
  RenderingPrimitives,
  ScaleModes,
  ShaderPrimitives,
  TextureFormat,
  WrapModes,
} from './types';
export type { ViewFollowOptions, ViewFollowTarget, ViewOptions, ViewShakeOptions } from './View';
export { View, ViewFlags } from './View';
export type { BlurFilterOptions } from '#rendering/filters/BlurFilter';
export { BlurFilter } from '#rendering/filters/BlurFilter';
export type { ColorMatrixEntries } from '#rendering/filters/ColorMatrixFilter';
export { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
export type { DropShadowFilterOptions } from '#rendering/filters/DropShadowFilter';
export { DropShadowFilter } from '#rendering/filters/DropShadowFilter';
export { Filter } from '#rendering/filters/Filter';
export type { LutFilterOptions, LutMode } from '#rendering/filters/LutFilter';
export { LutFilter } from '#rendering/filters/LutFilter';
export type { ShaderFilterLanguage, ShaderFilterOptions, ShaderFilterSourceOptions, ShaderFilterUniformValue } from '#rendering/filters/ShaderFilter';
export { ShaderFilter } from '#rendering/filters/ShaderFilter';
export { ShaderFilterBackendError } from '#rendering/filters/ShaderFilterBackendError';
export { Geometry } from '#rendering/geometry/Geometry';
export type { AttributeType, GeometryAttribute, GeometryOptions, GeometryUsage, Topology } from '#rendering/geometry/GeometryAttribute';
export type { GradientStop, GradientToTextureOptions, GradientType } from '#rendering/gradient/Gradient';
export { Gradient } from '#rendering/gradient/Gradient';
export { LinearGradient } from '#rendering/gradient/LinearGradient';
export { RadialGradient } from '#rendering/gradient/RadialGradient';
export type { MaterialOptions, UniformValue } from '#rendering/material/Material';
export { Material } from '#rendering/material/Material';
export { MeshMaterial } from '#rendering/material/MeshMaterial';
export type { ShaderSourceOptions } from '#rendering/material/ShaderSource';
export { ShaderSource } from '#rendering/material/ShaderSource';
export { SpriteMaterial } from '#rendering/material/SpriteMaterial';
export type { MeshIndexArray, MeshIndexFormat } from '#rendering/mesh/indices';
export { maxUint16VertexCount, meshIndexBytes, meshIndexFormatFor } from '#rendering/mesh/indices';
export type { MeshOptions } from '#rendering/mesh/Mesh';
export { Mesh } from '#rendering/mesh/Mesh';
export { Graphics } from '#rendering/primitives/Graphics';
export { INSTANCE_TRANSFORM_GLSL, INSTANCE_TRANSFORM_WGSL } from '#rendering/shader/instanceContract';
export type { ShaderProgram } from '#rendering/shader/Shader';
export { Shader } from '#rendering/shader/Shader';
export { ShaderAttribute } from '#rendering/shader/ShaderAttribute';
export { ShaderUniform } from '#rendering/shader/ShaderUniform';
export type { AnimatedSpriteClipDefinition, AnimatedSpritePlayOptions } from '#rendering/sprite/AnimatedSprite';
export { AnimatedSprite } from '#rendering/sprite/AnimatedSprite';
export type { NineSliceInsets, NineSliceModes, NineSliceOptions } from '#rendering/sprite/nineSlice';
export { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
export type { RepeatingSpriteOptions } from '#rendering/sprite/repeatingPlan';
export { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
export { Sprite, SpriteFlags } from '#rendering/sprite/Sprite';
export type { SpritesheetData, SpritesheetFrame } from '#rendering/sprite/Spritesheet';
export { Spritesheet } from '#rendering/sprite/Spritesheet';
export { AbstractText } from '#rendering/text/AbstractText';
export type { BitmapTextOptions } from '#rendering/text/BitmapText';
export { BitmapText, BmFontAdapter } from '#rendering/text/BitmapText';
export type { BmFontChar, BmFontData } from '#rendering/text/BmFont';
export { BmFont } from '#rendering/text/BmFont';
export type { AtlasMode } from '#rendering/text/GlyphAtlas';
export { GlyphAtlas } from '#rendering/text/GlyphAtlas';
export { GlyphMetrics } from '#rendering/text/GlyphMetrics';
export type { FontFormat, HTMLTextOptions } from '#rendering/text/HTMLText';
export { HTMLText } from '#rendering/text/HTMLText';
export type { LayoutOptions } from '#rendering/text/LayoutOptions';
export type { TextOptions } from '#rendering/text/Text';
export { Text } from '#rendering/text/Text';
export type { FontFamily, FontRegistry, FontWeight, GradientAxis, StyleChangeHint, TextStyleOptions } from '#rendering/text/TextStyle';
export { TextStyle } from '#rendering/text/TextStyle';
export type {
  GlyphInfo,
  GlyphKey,
  GlyphPlacement,
  GlyphProvider,
  TextAlignment,
  TextLayoutResult,
  TextLayoutStyle,
  TextLineMetrics,
  TextPageQuads,
  TextSize,
} from '#rendering/text/types';
export type { CompressedTextureLevel, CompressedTexturePayload } from '#rendering/texture/compressedPayload';
export type { CompressedTextureOptions } from '#rendering/texture/CompressedTexture';
export { CompressedTexture } from '#rendering/texture/CompressedTexture';
export type { CompressedBlockLayout } from '#rendering/texture/CompressedTextureFormat';
export {
  compressedBlockLayout,
  compressedBlocksAcross,
  compressedBlocksDown,
  compressedFormatPreference,
  compressedLevelByteLength,
  CompressedTextureFormat,
  isCompressedTextureFormat,
  orderCompressedFormats,
} from '#rendering/texture/CompressedTextureFormat';
export type { DataTextureBuffer, DataTextureDirtyRegion, DataTextureFormat, DataTextureOptions } from '#rendering/texture/DataTexture';
export { DataTexture } from '#rendering/texture/DataTexture';
export { RenderTexture } from '#rendering/texture/RenderTexture';
export type { RepeatFit, RepeatMode, RepeatPlan, RepeatSegment } from '#rendering/texture/repeat';
export { Texture } from '#rendering/texture/Texture';
export type { SamplerOptions, TextureOptions, TextureUploadOptions } from '#rendering/texture/TextureOptions';
export type { TextureRegionInsets, TextureRegionOptions } from '#rendering/texture/TextureRegion';
export { TextureRegion } from '#rendering/texture/TextureRegion';
export { Video } from '#rendering/video/Video';
