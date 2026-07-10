/// <reference types="@webgpu/types" />

import { Rectangle } from '#math/Rectangle';
import type { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { computeShaderTiling, type RepeatingSpriteQuad } from '#rendering/sprite/repeatingSpritePlan';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { RepeatMode } from '#rendering/texture/repeat';
import { Texture } from '#rendering/texture/Texture';
import { type BlendModes } from '#rendering/types';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { WebGpuInstanceArena } from './WebGpuInstanceArena';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

// ---------------------------------------------------------------------------
// Shared WGSL declarations — structs, bindings, and output struct used by
// both the shader path and the geometry path entry points.
// ---------------------------------------------------------------------------

/** Shared WGSL structs/bindings used by both repeating-sprite entry points. @internal */
export const commonWgsl = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};
struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
@group(1) @binding(0) var spriteTexture: texture_2d<f32>;
@group(1) @binding(1) var spriteSampler: sampler;

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv:    vec2<f32>,
    @location(1) color: vec4<f32>,
};
`;

// ---------------------------------------------------------------------------
// Shader path WGSL — one quad per sprite, UVs computed in vertex shader.
// ---------------------------------------------------------------------------

/** WGSL entry points for the shader (one-quad-per-sprite) repeating-sprite path. @internal */
export const shaderPathEntries = `
struct ShaderVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvParams:   vec4<f32>,  // tilingX, tilingY, offsetU, offsetV
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn shaderVert(input: ShaderVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;
    let lx = select(input.quadBounds.x, input.quadBounds.z, cx == 1u);
    let ly = select(input.quadBounds.y, input.quadBounds.w, cy == 1u);

    let destW = input.quadBounds.z - input.quadBounds.x;
    let destH = input.quadBounds.w - input.quadBounds.y;

    let slot = transforms[input.nodeIndex];
    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = projection.matrix * vec4<f32>(wx, wy, 0.0, 1.0);

    let u = select(input.uvParams.z, ((lx - input.quadBounds.x) / destW) * input.uvParams.x + input.uvParams.z, destW > 0.0);
    let v = select(input.uvParams.w, ((ly - input.quadBounds.y) / destH) * input.uvParams.y + input.uvParams.w, destH > 0.0);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn shaderFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
`;

// ---------------------------------------------------------------------------
// Geometry path WGSL — N quads per sprite, UVs pre-computed in CPU.
// ---------------------------------------------------------------------------

/** WGSL entry points for the geometry (N-quads-per-sprite) repeating-sprite path. @internal */
export const geoPathEntries = `
struct GeoVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvBounds:   vec4<f32>,  // u0,v0,u1,v1 (normalised, flipY pre-applied)
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn geoVert(input: GeoVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;
    let lx = select(input.quadBounds.x, input.quadBounds.z, cx == 1u);
    let ly = select(input.quadBounds.y, input.quadBounds.w, cy == 1u);

    let slot = transforms[input.nodeIndex];
    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = projection.matrix * vec4<f32>(wx, wy, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cx == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cy == 1u);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn geoFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
`;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const shaderStrideBytes = 40; // float32x4 bounds + float32x4 uvParams + unorm8x4 + uint32
const geoStrideBytes = 32; // float32x4 bounds + unorm16x4 + unorm8x4 + uint32 (NineSlice layout)
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

// ---------------------------------------------------------------------------
// Sampler address mode helper
// ---------------------------------------------------------------------------

function repeatModeToAddressMode(mode: RepeatMode): GPUAddressMode {
  if (mode === 'repeat') return 'repeat';
  if (mode === 'mirror-repeat') return 'mirror-repeat';
  return 'clamp-to-edge';
}

/** Instanced renderer for {@link RepeatingSprite} using WebGPU. */
export class WebGpuRepeatingSpriteRenderer extends AbstractWebGpuRenderer<RepeatingSprite> {
  private readonly _projData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);

  // Shared GPU objects
  private _device: GPUDevice | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuf: GPUBuffer | null = null;
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  private readonly _samplers = new Map<string, GPUSampler>();

  // Frame-scoped append arena shared by both paths: a single flush only ever
  // draws one path (render() flushes on a path change), so consecutive batch
  // flushes accumulate into one open pass at distinct byte offsets — the frame
  // submits once instead of once per flush. CPU staging stays per-path (the two
  // layouts differ in stride).
  private readonly _instanceArena = new WebGpuInstanceArena('repeating-sprite:instance-buffer', initialBatchCapacity * shaderStrideBytes);

  // Shader-path CPU staging
  private _shaderInstCapacity = 0;
  private _shaderInstData: ArrayBuffer = new ArrayBuffer(0);
  private _shaderInstF32 = new Float32Array(this._shaderInstData);
  private _shaderInstU32 = new Uint32Array(this._shaderInstData);
  private _shaderQuadCount = 0;

  // Geometry-path CPU staging
  private _geoInstCapacity = 0;
  private _geoInstData: ArrayBuffer = new ArrayBuffer(0);
  private _geoInstF32 = new Float32Array(this._geoInstData);
  private _geoInstU32 = new Uint32Array(this._geoInstData);
  private _geoQuadCount = 0;

  // Shared batch state
  private _maxNodeIndex = 0;
  private _currentTexture: Texture | RenderTexture | null = null;
  private _currentBlendMode: BlendModes | null = null;
  private _currentModeX: RepeatMode | null = null;
  private _currentModeY: RepeatMode | null = null;
  private _currentPath: 'shader' | 'geometry' | null = null;
  // Reusable scratch for device-snapped bounds ('geometry' mode).
  private readonly _snapBounds = new Rectangle();

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) return;

    const device = backend.device;
    this._device = device;

    this._shaderModule = device.createShaderModule({
      label: 'repeating-sprite:shader',
      code: commonWgsl + shaderPathEntries + geoPathEntries,
    });

    this._uniformBindGroupLayout = device.createBindGroupLayout({
      label: 'repeating-sprite:bind-group-layout:uniform',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this._textureBindGroupLayout = device.createBindGroupLayout({
      label: 'repeating-sprite:bind-group-layout:texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this._uniformBuffer = device.createBuffer({
      label: 'repeating-sprite:uniform-buffer',
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = device.createBuffer({
      label: 'repeating-sprite:index-buffer',
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceArena.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._pipelines.clear();
    this._samplers.clear();

    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuf = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;

    this._shaderInstCapacity = 0;
    this._shaderInstData = new ArrayBuffer(0);
    this._shaderInstF32 = new Float32Array(this._shaderInstData);
    this._shaderInstU32 = new Uint32Array(this._shaderInstData);
    this._geoInstCapacity = 0;
    this._geoInstData = new ArrayBuffer(0);
    this._geoInstF32 = new Float32Array(this._geoInstData);
    this._geoInstU32 = new Uint32Array(this._geoInstData);

    this._shaderQuadCount = 0;
    this._geoQuadCount = 0;
    this._maxNodeIndex = 0;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._currentModeX = null;
    this._currentModeY = null;
    this._currentPath = null;
  }

  public render(sprite: RepeatingSprite): void {
    const backend = this._backend;
    if (!backend) return;

    const texture = sprite.texture;
    if (texture instanceof Texture && texture.source === null) return;
    if (texture.width === 0 || texture.height === 0) return;

    const strategy = sprite.resolvedStrategy;
    const blendMode = sprite.blendMode;
    const modeX = sprite.modeX;
    const modeY = sprite.modeY;

    const hasData = this._shaderQuadCount > 0 || this._geoQuadCount > 0;

    if (hasData) {
      const pathChanged = this._currentPath !== strategy;
      const texChanged = this._currentTexture !== texture;
      const blendChanged = this._currentBlendMode !== blendMode;
      const modeChanged = strategy === 'shader' && (this._currentModeX !== modeX || this._currentModeY !== modeY);

      if (pathChanged || texChanged || blendChanged || modeChanged) {
        this.flush();
      }
    }

    this._currentTexture = texture;
    this._currentBlendMode = blendMode;
    this._currentPath = strategy;
    backend.setBlendMode(blendMode);

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);
    if (nodeIndex > this._maxNodeIndex) this._maxNodeIndex = nodeIndex;

    if (strategy === 'shader') {
      this._currentModeX = modeX;
      this._currentModeY = modeY;
      this._writeShaderInstance(sprite, nodeIndex);
    } else {
      this._writeGeoQuads(sprite, nodeIndex);
    }
  }

  private _writeShaderInstance(sprite: RepeatingSprite, nodeIndex: number): void {
    const texture = sprite.texture;
    const srcW = sprite.region.width;
    const srcH = sprite.region.height;
    let destW = sprite.width;
    let destH = sprite.height;
    const flipY = texture instanceof Texture && texture.flipY;

    // 'geometry' mode: snap the destination quad to the device grid. Repetition
    // stays shader-based; only the outer rectangle (and the tiling derived from
    // it) moves. Position/none leave the destination unchanged.
    if (sprite.pixelSnapMode === 'geometry') {
      const backend = this.getBackend();
      const snap = backend._getSnapPixelSize();
      const rb = sprite.getRenderBounds(backend.view, snap.width, snap.height, this._snapBounds);

      destW = rb.width;
      destH = rb.height;
    }

    const tilingX = computeShaderTiling(srcW, destW, sprite.modeX, sprite.fitX);
    const tilingY = computeShaderTiling(srcH, destH, sprite.modeY, sprite.fitY);
    const offsetU = sprite.offsetX / (srcW > 0 ? srcW : 1);
    const offsetV = sprite.offsetY / (srcH > 0 ? srcH : 1);
    const uvParamY = flipY ? -tilingY : tilingY;
    const uvParamW = flipY ? tilingY + offsetV : offsetV;

    this._ensureShaderCapacity(this._shaderQuadCount + 1);

    const words = shaderStrideBytes / 4;
    const offset = this._shaderQuadCount * words;
    const f32 = this._shaderInstF32;
    const u32 = this._shaderInstU32;

    f32[offset + 0] = 0;
    f32[offset + 1] = 0;
    f32[offset + 2] = destW;
    f32[offset + 3] = destH;
    f32[offset + 4] = tilingX;
    f32[offset + 5] = uvParamY;
    f32[offset + 6] = offsetU;
    f32[offset + 7] = uvParamW;
    u32[offset + 8] = sprite.tint.toRgba();
    u32[offset + 9] = nodeIndex >>> 0;

    this._shaderQuadCount++;
  }

  private _writeGeoQuads(sprite: RepeatingSprite, nodeIndex: number): void {
    let quads: readonly RepeatingSpriteQuad[] = sprite.quads;

    // 'geometry' mode: snap shared segment boundaries once (gap-free), like NineSlice.
    if (sprite.pixelSnapMode === 'geometry') {
      const backend = this.getBackend();
      const snap = backend._getSnapPixelSize();

      quads = sprite.getRenderQuads(backend.view, snap.width, snap.height);
    }

    if (quads.length === 0) return;

    const flipY = sprite.texture instanceof Texture && sprite.texture.flipY;
    const tint = sprite.tint.toRgba();
    const words = geoStrideBytes / 4;

    this._ensureGeoCapacity(this._geoQuadCount + quads.length);

    const f32 = this._geoInstF32;
    const u32 = this._geoInstU32;

    for (let i = 0; i < quads.length; i++) {
      // i is bounded by quads.length via the for-loop guard.
      const q = quads[i]!;
      const offset = (this._geoQuadCount + i) * words;

      f32[offset + 0] = q.x0;
      f32[offset + 1] = q.y0;
      f32[offset + 2] = q.x1;
      f32[offset + 3] = q.y1;

      const uMin = (q.u0 * 0xffff) & 0xffff;
      const uMax = (q.u1 * 0xffff) & 0xffff;
      const v0Raw = (q.v0 * 0xffff) & 0xffff;
      const v1Raw = (q.v1 * 0xffff) & 0xffff;
      const vMin = flipY ? v1Raw : v0Raw;
      const vMax = flipY ? v0Raw : v1Raw;

      u32[offset + 4] = uMin | (vMin << 16);
      u32[offset + 5] = uMax | (vMax << 16);
      u32[offset + 6] = tint;
      u32[offset + 7] = nodeIndex >>> 0;
    }

    this._geoQuadCount += quads.length;
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;
    const uniform = this._uniformBuffer;

    if (!backend || !device || !uniform) return;

    if (this._shaderQuadCount === 0 && this._geoQuadCount === 0 && !backend.clearRequested) {
      return;
    }

    const vm = backend.view.getTransform();
    this._projData.set([vm.a, vm.c, 0, 0, vm.b, vm.d, 0, 0, 0, 0, 1, 0, vm.x, vm.y, 0, vm.z]);
    device.queue.writeBuffer(uniform, 0, this._projData.buffer, this._projData.byteOffset, this._projData.byteLength);

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    // A single flush only ever draws one path (render() flushes on a path
    // change), so exactly one of the two counts is non-zero here.
    const drawShader = this._shaderQuadCount > 0 && !maskClipsAll;
    const drawGeo = this._geoQuadCount > 0 && !maskClipsAll;

    if (drawShader || drawGeo) {
      const batchBytes = drawShader ? this._shaderQuadCount * shaderStrideBytes : this._geoQuadCount * geoStrideBytes;
      const needCount = this._maxNodeIndex + 1;

      let active = backend._passCoordinator.acquirePass();

      this._instanceArena.syncPass(active);

      // Resolving the transform storage may reallocate (and free) its GPU buffer;
      // end the pass first when earlier batches in it still reference the old one.
      if (this._instanceArena.cursor > 0 && backend._transformStorageWouldGrow(needCount)) {
        backend._passCoordinator.endPass();
        active = backend._passCoordinator.acquirePass();
        this._instanceArena.resetPass();
        this._instanceArena.syncPass(active);
      }

      if (!this._instanceArena.fits(batchBytes)) {
        if (this._instanceArena.cursor > 0) {
          backend._passCoordinator.endPass();
          active = backend._passCoordinator.acquirePass();
          this._instanceArena.resetPass();
          this._instanceArena.syncPass(active);
        }

        this._instanceArena.grow(device, batchBytes);
      }

      const offset = this._instanceArena.take(batchBytes);
      const instanceBuffer = this._instanceArena.buffer!;
      const stencil = backend._passCoordinator.stencilActive;

      if (drawShader) {
        this._drawShaderBatch(device, backend, active.pass, stencil, instanceBuffer, offset);
      } else {
        this._drawGeoBatch(device, backend, active.pass, stencil, instanceBuffer, offset);
      }
    } else if (backend.clearRequested) {
      backend._passCoordinator.acquirePass();
    }

    // Batch flushes no longer submit; the backend ends the pass at boundaries.
    this._shaderQuadCount = 0;
    this._geoQuadCount = 0;
    this._maxNodeIndex = 0;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._currentModeX = null;
    this._currentModeY = null;
    this._currentPath = null;
  }

  private _drawShaderBatch(
    device: GPUDevice,
    backend: WebGpuBackend,
    pass: GPURenderPassEncoder,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    if (!this._indexBuffer || this._currentBlendMode === null || this._currentTexture === null) return;

    device.queue.writeBuffer(instanceBuffer, instanceByteOffset, this._shaderInstData, 0, this._shaderQuadCount * shaderStrideBytes);

    const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
    const uniformBindGroup = this._getOrCreateTransformBindGroup(device, this._uniformBuffer!, storage.buffer);

    const modeX = this._currentModeX ?? 'repeat';
    const modeY = this._currentModeY ?? 'repeat';
    const sampler = this._getOrCreateSampler(device, modeX, modeY);
    const texView = backend.getTextureBinding(this._currentTexture).view;
    const textureBindGroup = device.createBindGroup({
      label: 'repeating-sprite:texture-bind-group:shader',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: texView },
        { binding: 1, resource: sampler },
      ],
    });

    const pipeline = this._getPipeline('shader', this._currentBlendMode, backend.renderTargetFormat, stencil);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerInstance, this._shaderQuadCount, 0, 0, 0);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _drawGeoBatch(
    device: GPUDevice,
    backend: WebGpuBackend,
    pass: GPURenderPassEncoder,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    if (!this._indexBuffer || this._currentBlendMode === null || this._currentTexture === null) return;

    device.queue.writeBuffer(instanceBuffer, instanceByteOffset, this._geoInstData, 0, this._geoQuadCount * geoStrideBytes);

    const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
    const uniformBindGroup = this._getOrCreateTransformBindGroup(device, this._uniformBuffer!, storage.buffer);

    // Geometry path: use backend's default (clamp) sampler.
    const binding = backend.getTextureBinding(this._currentTexture);
    const textureBindGroup = device.createBindGroup({
      label: 'repeating-sprite:texture-bind-group:geo',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });

    const pipeline = this._getPipeline('geo', this._currentBlendMode, backend.renderTargetFormat, stencil);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerInstance, this._geoQuadCount, 0, 0, 0);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  public destroy(): void {
    this.disconnect();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _getOrCreateSampler(device: GPUDevice, modeX: RepeatMode, modeY: RepeatMode): GPUSampler {
    const key = `${modeX}:${modeY}`;
    const existing = this._samplers.get(key);
    if (existing) return existing;

    const sampler = device.createSampler({
      label: 'repeating-sprite:sampler',
      addressModeU: repeatModeToAddressMode(modeX),
      addressModeV: repeatModeToAddressMode(modeY),
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this._samplers.set(key, sampler);
    return sampler;
  }

  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuf: GPUBuffer, storageBuf: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuf === storageBuf) {
      return this._transformBindGroup;
    }
    this._transformStorageBuf = storageBuf;
    this._transformBindGroup = device.createBindGroup({
      label: 'repeating-sprite:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: storageBuf } },
      ],
    });
    return this._transformBindGroup;
  }

  private _getPipeline(kind: 'shader' | 'geo', blend: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${kind}:${blend}:${format}:${stencil ? 's' : 'n'}`;
    const existing = this._pipelines.get(key);
    if (existing) return existing;

    if (!this._device || !this._shaderModule || !this._uniformBindGroupLayout || !this._textureBindGroupLayout) {
      throw new Error('WebGpuRepeatingSpriteRenderer: not connected.');
    }

    const layout = this._device.createPipelineLayout({
      label: 'repeating-sprite:pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });

    const isShader = kind === 'shader';
    const strideBytes = isShader ? shaderStrideBytes : geoStrideBytes;

    const buffers: GPUVertexBufferLayout[] = isShader
      ? [
          {
            arrayStride: strideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'unorm8x4' },
              { shaderLocation: 3, offset: 36, format: 'uint32' },
            ],
          },
        ]
      : [
          {
            arrayStride: strideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'unorm16x4' },
              { shaderLocation: 2, offset: 24, format: 'unorm8x4' },
              { shaderLocation: 3, offset: 28, format: 'uint32' },
            ],
          },
        ];

    const desc: GPURenderPipelineDescriptor = {
      label: 'repeating-sprite:render-pipeline',
      layout,
      vertex: {
        module: this._shaderModule,
        entryPoint: isShader ? 'shaderVert' : 'geoVert',
        buffers,
      },
      fragment: {
        module: this._shaderModule,
        entryPoint: isShader ? 'shaderFrag' : 'geoFrag',
        targets: [{ format, blend: getWebGpuBlendState(blend), writeMask: GPUColorWrite.ALL }],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      desc.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = this._device.createRenderPipeline(desc);
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  // Grow the CPU staging arrays for the batch being packed. The GPU instance
  // buffer is a separate frame-scoped arena managed in flush().
  private _ensureShaderCapacity(needed: number): void {
    if (needed <= this._shaderInstCapacity) return;
    this._shaderInstCapacity = this._growCapacity(this._shaderInstCapacity, needed);
    const oldData = this._shaderInstData;
    const carry = this._shaderQuadCount * shaderStrideBytes;
    this._shaderInstData = new ArrayBuffer(this._shaderInstCapacity * shaderStrideBytes);
    if (carry > 0) new Uint8Array(this._shaderInstData).set(new Uint8Array(oldData, 0, carry));
    this._shaderInstF32 = new Float32Array(this._shaderInstData);
    this._shaderInstU32 = new Uint32Array(this._shaderInstData);
  }

  private _ensureGeoCapacity(needed: number): void {
    if (needed <= this._geoInstCapacity) return;
    this._geoInstCapacity = this._growCapacity(this._geoInstCapacity, needed);
    const oldData = this._geoInstData;
    const carry = this._geoQuadCount * geoStrideBytes;
    this._geoInstData = new ArrayBuffer(this._geoInstCapacity * geoStrideBytes);
    if (carry > 0) new Uint8Array(this._geoInstData).set(new Uint8Array(oldData, 0, carry));
    this._geoInstF32 = new Float32Array(this._geoInstData);
    this._geoInstU32 = new Uint32Array(this._geoInstData);
  }

  private _growCapacity(current: number, needed: number): number {
    let cap = Math.max(current, initialBatchCapacity);
    while (cap < needed) cap *= 2;
    return cap;
  }
}
