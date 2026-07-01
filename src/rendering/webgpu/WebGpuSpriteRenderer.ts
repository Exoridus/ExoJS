/// <reference types="@webgpu/types" />

import { Rectangle } from '#math/Rectangle';
import type { UniformValue } from '#rendering/material/Material';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexWgsl } from '#rendering/sprite/spriteMaterialSources';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

/** WGSL source for the default sprite pipeline. @internal */
export const spriteShaderSource = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1)
var<storage, read> transforms: array<TransformSlot>;

@group(1) @binding(0)
var spriteTexture0: texture_2d<f32>;
@group(1) @binding(1)
var spriteTexture1: texture_2d<f32>;
@group(1) @binding(2)
var spriteTexture2: texture_2d<f32>;
@group(1) @binding(3)
var spriteTexture3: texture_2d<f32>;
@group(1) @binding(4)
var spriteTexture4: texture_2d<f32>;
@group(1) @binding(5)
var spriteTexture5: texture_2d<f32>;
@group(1) @binding(6)
var spriteTexture6: texture_2d<f32>;
@group(1) @binding(7)
var spriteTexture7: texture_2d<f32>;

@group(1) @binding(8)
var spriteSampler0: sampler;
@group(1) @binding(9)
var spriteSampler1: sampler;
@group(1) @binding(10)
var spriteSampler2: sampler;
@group(1) @binding(11)
var spriteSampler3: sampler;
@group(1) @binding(12)
var spriteSampler4: sampler;
@group(1) @binding(13)
var spriteSampler5: sampler;
@group(1) @binding(14)
var spriteSampler6: sampler;
@group(1) @binding(15)
var spriteSampler7: sampler;

// Per-instance vertex layout (36 bytes per sprite). The four corners
// of the quad are derived from @builtin(vertex_index) 0..3 inside the
// vertex shader — there is no per-vertex stream. The world transform is
// fetched from the shared transform storage buffer keyed by nodeIndex
// instead of being packed inline.
struct VertexInput {
    @location(0) localBounds: vec4<f32>,        // left, top, right, bottom (local space)
    @location(3) uvBounds: vec4<f32>,           // uMin, vMin, uMax, vMax (CPU pre-swaps for flipY)
    @location(4) color: vec4<f32>,              // RGBA tint
    @location(5) packedSlotFlags: u32,          // bits 0..7 = slot, bit 8 = premultiply
    @location(6) nodeIndex: u32,                // row into the shared transform storage buffer
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
    @location(3) @interpolate(flat) textureSlot: u32,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → corners in TL, TR, BR, BL order (matches the static index
    // buffer [0,1,2,0,2,3] used for indexed triangle-list drawing).
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    let localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    // Fetch this instance's world transform from the shared storage buffer,
    // keyed by nodeIndex: m0 = (a, b, c, d), m1 = (tx, ty, 0, 0). (m2 carries the
    // node tint, unused here — the sprite keeps its own per-instance color.)
    let slot = transforms[input.nodeIndex];
    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    output.position = projection.matrix * vec4<f32>(worldX, worldY, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);
    output.textureSlot = input.packedSlotFlags & 0xFFu;
    output.premultiplySample = (input.packedSlotFlags >> 8u) & 1u;

    return output;
}

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    switch slot {
        case 0u: {
            return textureSampleGrad(spriteTexture0, spriteSampler0, uv, ddx, ddy);
        }
        case 1u: {
            return textureSampleGrad(spriteTexture1, spriteSampler1, uv, ddx, ddy);
        }
        case 2u: {
            return textureSampleGrad(spriteTexture2, spriteSampler2, uv, ddx, ddy);
        }
        case 3u: {
            return textureSampleGrad(spriteTexture3, spriteSampler3, uv, ddx, ddy);
        }
        case 4u: {
            return textureSampleGrad(spriteTexture4, spriteSampler4, uv, ddx, ddy);
        }
        case 5u: {
            return textureSampleGrad(spriteTexture5, spriteSampler5, uv, ddx, ddy);
        }
        case 6u: {
            return textureSampleGrad(spriteTexture6, spriteSampler6, uv, ddx, ddy);
        }
        default: {
            return textureSampleGrad(spriteTexture7, spriteSampler7, uv, ddx, ddy);
        }
    }
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Compute screen-space derivatives in uniform control flow before the
    // per-slot switch. WGSL requires textureSample (implicit LOD) to run in
    // uniform control flow, which multi-texture batching breaks because the
    // slot varies per fragment. textureSampleGrad takes explicit derivatives
    // and is valid regardless of control-flow uniformity, while preserving
    // mipmap-correct LOD when sprites use mipmapped textures.
    let ddx = dpdx(input.texcoord);
    let ddy = dpdy(input.texcoord);
    let sample = sampleTexture(input.textureSlot, input.texcoord, ddx, ddy);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;

const instanceStrideBytes = 36;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const maxBatchTextures = 8;
const maxCustomTextureSlots = 7; // user texture uniforms; group(2) binding 1..N
const indicesPerSprite = 6;
// Static index buffer: two triangles forming a quad, vertex IDs 0..3 in
// TL/TR/BR/BL order so the WGSL `cornerX/cornerY` derivation matches.
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Per-material GPU resources for the custom sprite path, cached against the
 * material instance and released when the material's `_onDispose` fires.
 * group(0) reuses the shared projection UBO; group(1) is the single base
 * texture; group(2) is the user UBO + texture/sampler pairs.
 */
interface CustomSpriteResources {
  shaderModule: GPUShaderModule;
  userLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<string, GPURenderPipeline>;
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  baseTextureBindGroups: WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView }>;
}

export class WebGpuSpriteRenderer extends AbstractWebGpuRenderer<Sprite> {
  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  // group(0) bind group = projection UBO + shared transform storage buffer.
  // Recreated whenever the storage buffer identity changes (capacity growth).
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _instanceBuffer: GPUBuffer | null = null;
  private _instanceCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

  private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
  private readonly _textureSlots = new Map<Texture | RenderTexture, number>();
  private _slotCount = 0;
  private _instanceCount = 0;
  // Highest transform-storage row referenced by the pending batch; drives the
  // minimum row count uploaded for the storage buffer at flush time.
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;

  // Custom-material state. Per-material pipelines/bind groups are cached; the
  // current batch's material/base-texture decide when to flush.
  private readonly _customMaterials = new Map<SpriteMaterial, CustomSpriteResources>();
  private _customBaseTextureLayout: GPUBindGroupLayout | null = null;
  private _currentMaterial: SpriteMaterial | null = null;
  private _currentBaseTexture: Texture | RenderTexture | null = null;
  // Reusable scratch for device-snapped local bounds ('geometry' mode), and the
  // bounds resolved for the sprite currently being packed (snapped or logical).
  private readonly _snapBounds: Rectangle = new Rectangle();
  private _activeBounds: Rectangle | null = null;

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    this._shaderModule = this._device.createShaderModule({ code: spriteShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        ...Array.from({ length: maxBatchTextures }, (_, index) => ({
          binding: index,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float' as const,
          },
        })),
        ...Array.from({ length: maxBatchTextures }, (_, index) => ({
          binding: maxBatchTextures + index,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering' as const,
          },
        })),
      ],
    });
    this._pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });
    // Single base-texture layout for the custom-material path (group 1).
    this._customBaseTextureLayout = this._device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this._uniformBuffer = this._device.createBuffer({
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // The group(0) bind group also binds the shared transform storage buffer,
    // whose identity changes when its capacity grows — so it is built lazily in
    // flush() once the active storage buffer is known.

    // Static index buffer for the quad. Allocated once at connect; its
    // contents never change.
    this._indexBuffer = this._device.createBuffer({
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();

    // Custom materials are owned by user code (one SpriteMaterial can be shared
    // across many sprites); their resources are released when the user calls
    // material.destroy(). On disconnect we eagerly release to avoid GPU leaks.
    for (const resources of this._customMaterials.values()) {
      this._releaseCustomResources(resources);
    }

    this._customMaterials.clear();
    this._pipelines.clear();
    this._instanceBuffer = null;
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    this._uniformBuffer = null;
    this._pipelineLayout = null;
    this._customBaseTextureLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;
    this._instanceCapacity = 0;
    this._instanceData = new ArrayBuffer(0);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._currentBlendMode = null;
    this._currentMaterial = null;
    this._currentBaseTexture = null;
    this._resetSlots();
  }

  public render(sprite: Sprite): void {
    const backend = this._backend;
    const texture = sprite.texture;

    // Same early-out conditions as the deferred renderer used to apply.
    if (
      backend === null ||
      (!(texture instanceof Texture) && !(texture instanceof RenderTexture)) ||
      texture.width === 0 ||
      texture.height === 0 ||
      (texture instanceof Texture && texture.source === null)
    ) {
      return;
    }

    const material = sprite.material;

    // The transform lives in the shared storage buffer, keyed by the draw
    // command's stable nodeIndex (already packed at the draw-command boundary).
    // A direct, non-plan `backend.draw(sprite)` has no command — push the
    // sprite's transform into the buffer and use the freshly-allocated slot.
    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    this._activeBounds = this._resolveBounds(sprite, backend);

    if (material === null) {
      this._renderDefault(sprite, texture, backend, nodeIndex);
    } else {
      this._renderCustom(sprite, texture, material, backend, nodeIndex);
    }
  }

  /**
   * Local bounds to upload for `sprite` this draw: device-pixel-snapped in
   * `'geometry'` pixel-snap mode (axis-aligned only), otherwise the sprite's
   * logical local bounds. Reuses a scratch rectangle and never mutates logical
   * state. Consumed synchronously by {@link _packInstance}.
   */
  private _resolveBounds(sprite: Sprite, backend: WebGpuBackend): Rectangle {
    if (sprite.pixelSnapMode !== 'geometry') {
      return sprite.getLocalBounds();
    }

    const snap = backend._getSnapPixelSize();

    return sprite.getRenderBounds(backend.view, snap.width, snap.height, this._snapBounds);
  }

  /** Default multi-texture path: rotate the base texture through 8 slots. */
  private _renderDefault(sprite: Sprite, texture: Texture | RenderTexture, backend: WebGpuBackend, nodeIndex: number): void {
    const blendMode = sprite.blendMode;

    // Flush triggers: blend-mode change, texture-slot exhaustion, or a custom
    // batch still in flight that must drain first.
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= maxBatchTextures;
    const materialSwitch = this._currentMaterial !== null && this._instanceCount > 0;

    if (blendModeChanged || slotExhausted || materialSwitch) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = null;
    backend.setBlendMode(blendMode);

    // Resolve / assign texture slot.
    let slot = this._textureSlots.get(texture);

    if (slot === undefined) {
      slot = this._slotCount++;
      this._textureSlots.set(texture, slot);
      this._activeTextures[slot] = texture;
    }

    const premultiplySample = backend.shouldPremultiplyTextureSample(texture) ? 1 : 0;
    const packedSlotFlags = slot | (premultiplySample << 8);

    // Ensure capacity covers the new entry BEFORE packing — otherwise the
    // typed-array writes in _packInstance silently fall off the end of a
    // too-small buffer.
    this._ensureInstanceCapacity(this._instanceCount + 1);
    this._packInstance(sprite, texture, packedSlotFlags, nodeIndex);
    this._instanceCount++;
  }

  /** Custom-material path: single base texture on group(1), instanced. */
  private _renderCustom(sprite: Sprite, texture: Texture | RenderTexture, material: SpriteMaterial, backend: WebGpuBackend, nodeIndex: number): void {
    if (material.shader.wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The material owns its blend mode; the sprite's own blendMode overrides it
    // when set away from the default (Normal).
    const blendMode = sprite.blendMode === BlendModes.Normal ? material.blendMode : sprite.blendMode;
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const materialChanged = this._currentMaterial !== null && material !== this._currentMaterial;
    const textureChanged = this._currentBaseTexture !== null && texture !== this._currentBaseTexture;
    const modeSwitch = this._currentMaterial === null && this._instanceCount > 0;

    if (blendModeChanged || materialChanged || textureChanged || modeSwitch) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = material;
    this._currentBaseTexture = texture;
    backend.setBlendMode(blendMode);

    // textureSlot word is unused by custom fragments (base binds to group(1)).
    this._ensureInstanceCapacity(this._instanceCount + 1);
    this._packInstance(sprite, texture, 0, nodeIndex);
    this._instanceCount++;
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;
    const uniformBuffer = this._uniformBuffer;

    if (!backend || !device || !uniformBuffer) {
      return;
    }

    if (this._instanceCount === 0 && !backend.clearRequested) {
      return;
    }

    const viewMatrix = backend.view.getTransform();

    this._projectionData.set([viewMatrix.a, viewMatrix.c, 0, 0, viewMatrix.b, viewMatrix.d, 0, 0, 0, 0, 1, 0, viewMatrix.x, viewMatrix.y, 0, viewMatrix.z]);

    device.queue.writeBuffer(uniformBuffer, 0, this._projectionData.buffer, this._projectionData.byteOffset, this._projectionData.byteLength);

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    // The coordinator owns the GPU pass: it opens the encoder + render pass
    // (load/clear resolution, pass count and scissor are applied there) and
    // ends + submits it below.
    const pass = backend._passCoordinator.acquirePass().pass;

    if (this._instanceCount > 0 && !maskClipsAll && this._instanceBuffer !== null && this._indexBuffer !== null && this._currentBlendMode !== null) {
      device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceData, 0, this._instanceCount * instanceStrideBytes);

      // Resolve the shared transform storage buffer (rows uploaded up to the
      // max nodeIndex referenced by this batch) and bind it alongside the
      // projection UBO on group(0). Both the default and custom programs fetch
      // the world transform from it via nodeIndex.
      const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);

      const material = this._currentMaterial;
      const stencil = backend._passCoordinator.stencilActive;

      if (material === null) {
        const pipeline = this._getPipeline(this._currentBlendMode, backend.renderTargetFormat, stencil);
        const textureBindGroup = this._createTextureBindGroup(device, backend);

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, transformBindGroup);
        pass.setBindGroup(1, textureBindGroup);
        pass.setVertexBuffer(0, this._instanceBuffer);
        pass.setIndexBuffer(this._indexBuffer, 'uint16');
        pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);
      } else {
        pass.pushDebugGroup('SpriteMaterial (custom)');
        this._drawCustomBatch(pass, device, backend, material, transformBindGroup, stencil);
        pass.popDebugGroup();
      }

      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    backend._passCoordinator.endPass();

    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._resetSlots();
    this._currentBlendMode = null;
    this._currentMaterial = null;
    this._currentBaseTexture = null;
  }

  /**
   * Build (or reuse) the group(0) bind group pairing the fixed projection UBO
   * with the shared transform storage buffer. Cached against the storage buffer
   * identity, which changes only when its capacity grows.
   */
  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuffer: GPUBuffer, storageBuffer: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuffer === storageBuffer) {
      return this._transformBindGroup;
    }

    this._transformStorageBuffer = storageBuffer;
    this._transformBindGroup = device.createBindGroup({
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  public destroy(): void {
    this.disconnect();
  }

  /**
   * Pre-create render pipelines for every blend-mode × target-format
   * combination this renderer can produce, asynchronously and in
   * parallel. Called from the render manager's init path so by the time
   * the first frame draws, all pipelines exist in cache.
   *
   * Without prewarm, the first draw of any new (blendMode, format)
   * combination would fall back to the synchronous _getPipeline() path,
   * which blocks while the WebGPU implementation compiles WGSL and
   * sets up the pipeline state object — typically tens of milliseconds.
   */
  public async prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const device = this._device;

    if (!device || !this._shaderModule || !this._pipelineLayout) {
      return;
    }

    if (typeof device.createRenderPipelineAsync !== 'function') {
      return;
    }

    const blendModes: readonly BlendModes[] = [
      BlendModes.Normal,
      BlendModes.Additive,
      BlendModes.Subtract,
      BlendModes.Multiply,
      BlendModes.Screen,
      BlendModes.Darken,
      BlendModes.Lighten,
    ];

    const promises: Array<Promise<void>> = [];

    for (const blendMode of blendModes) {
      for (const format of formats) {
        const pipelineKey = `${blendMode}:${format}`;

        if (this._pipelines.has(pipelineKey)) {
          continue;
        }

        const promise = device.createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format)).then(pipeline => {
          this._pipelines.set(pipelineKey, pipeline);
        });

        promises.push(promise);
      }
    }

    await Promise.all(promises);
  }

  private _packInstance(sprite: Sprite, texture: Texture | RenderTexture, packedSlotFlags: number, nodeIndex: number): void {
    const offset = this._instanceCount * wordsPerInstance;
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;

    // localBounds: left, top, right, bottom (words 0..3, offset 0) — device-snapped in
    // 'geometry' pixel-snap mode, otherwise the logical local bounds.
    const bounds = this._activeBounds ?? sprite.getLocalBounds();

    f32[offset + 0] = bounds.left;
    f32[offset + 1] = bounds.top;
    f32[offset + 2] = bounds.right;
    f32[offset + 3] = bounds.bottom;

    // uvBounds: u16x4 normalised, packed into two u32 slots (words 4,5, offset
    // 16). The CPU applies the flipY swap so the shader stays orientation-agnostic.
    const frame = sprite.textureFrame;
    const texWidth = texture.width;
    const texHeight = texture.height;
    const uMin = ((frame.left / texWidth) * 0xffff) & 0xffff;
    const uMax = ((frame.right / texWidth) * 0xffff) & 0xffff;
    const vMinRaw = ((frame.top / texHeight) * 0xffff) & 0xffff;
    const vMaxRaw = ((frame.bottom / texHeight) * 0xffff) & 0xffff;
    const flipY = texture instanceof Texture && texture.flipY;
    const vMin = flipY ? vMaxRaw : vMinRaw;
    const vMax = flipY ? vMinRaw : vMaxRaw;

    u32[offset + 4] = uMin | (vMin << 16);
    u32[offset + 5] = uMax | (vMax << 16);

    // color (u8x4 packed) at word 6 (offset 24)
    u32[offset + 6] = sprite.tint.toRgba();

    // packedSlotFlags (u32) at word 7 (offset 28)
    u32[offset + 7] = packedSlotFlags;

    // nodeIndex (u32) at word 8 (offset 32) — row into the shared transform buffer.
    const node = nodeIndex >>> 0;

    u32[offset + 8] = node;

    if (node > this._maxNodeIndex) {
      this._maxNodeIndex = node;
    }
  }

  private _ensureInstanceCapacity(instanceCount: number): void {
    if (!this._device || instanceCount <= this._instanceCapacity) {
      return;
    }

    let nextCapacity = Math.max(this._instanceCapacity, initialBatchCapacity);

    while (nextCapacity < instanceCount) {
      nextCapacity *= 2;
    }

    const oldData = this._instanceData;
    // Preserve any already-packed instances. _instanceCount is bounded by
    // the previous capacity, but oldData may be the initial 0-byte buffer
    // — clamp to its actual byteLength to avoid out-of-range typed-array
    // construction.
    const carryBytes = Math.min(this._instanceCount * instanceStrideBytes, oldData.byteLength);

    const instanceData = new ArrayBuffer(nextCapacity * instanceStrideBytes);

    if (carryBytes > 0) {
      new Uint8Array(instanceData).set(new Uint8Array(oldData, 0, carryBytes));
    }

    const instanceBuffer = this._device.createBuffer({
      size: instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._instanceBuffer?.destroy();

    this._instanceCapacity = nextCapacity;
    this._instanceData = instanceData;
    this._instanceFloat32 = new Float32Array(instanceData);
    this._instanceUint32 = new Uint32Array(instanceData);
    this._instanceBuffer = instanceBuffer;
  }

  private _resetSlots(): void {
    if (this._slotCount > 0) {
      for (let i = 0; i < this._slotCount; i++) {
        this._activeTextures[i] = null;
      }

      this._textureSlots.clear();
      this._slotCount = 0;
    }
  }

  private _createTextureBindGroup(device: GPUDevice, backend: WebGpuBackend): GPUBindGroup {
    // Slots beyond the active count get the slot-0 texture as a filler so
    // the bind-group layout always sees N valid texture views and samplers.
    // The fragment shader's switch only ever dispatches to the active slot
    // count, so unsampled fillers cost nothing visually.
    const fallbackTexture = this._activeTextures[0] ?? Texture.empty;
    const fallbackBinding = backend.getTextureBinding(fallbackTexture);
    const resolvedBindings = new Array<ReturnType<WebGpuBackend['getTextureBinding']>>(maxBatchTextures);

    for (let i = 0; i < maxBatchTextures; i++) {
      const texture = this._activeTextures[i] ?? fallbackTexture;

      resolvedBindings[i] = texture === fallbackTexture ? fallbackBinding : backend.getTextureBinding(texture);
    }

    const entries: GPUBindGroupEntry[] = [];

    // resolvedBindings has length maxBatchTextures and was fully populated above.
    for (let i = 0; i < maxBatchTextures; i++) {
      entries.push({
        binding: i,
        resource: resolvedBindings[i]!.view,
      });
    }

    for (let i = 0; i < maxBatchTextures; i++) {
      entries.push({
        binding: maxBatchTextures + i,
        resource: resolvedBindings[i]!.sampler,
      });
    }

    return device.createBindGroup({
      layout: this._textureBindGroupLayout!,
      entries,
    });
  }

  private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const pipelineKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existingPipeline = this._pipelines.get(pipelineKey);

    if (existingPipeline) {
      return existingPipeline;
    }

    if (!this._device || !this._shaderModule || !this._pipelineLayout || !this._backend) {
      throw new Error('Renderer has to be connected first!');
    }

    const pipeline = this._device.createRenderPipeline(this._buildPipelineDescriptor(blendMode, format, stencil));

    this._pipelines.set(pipelineKey, pipeline);

    return pipeline;
  }

  private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    if (!this._shaderModule || !this._pipelineLayout) {
      throw new Error('Renderer has to be connected first!');
    }

    const descriptor: GPURenderPipelineDescriptor = {
      layout: this._pipelineLayout,
      vertex: {
        module: this._shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: instanceStrideBytes,
            stepMode: 'instance',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x4',
              },
              {
                shaderLocation: 3,
                offset: 16,
                format: 'unorm16x4',
              },
              {
                shaderLocation: 4,
                offset: 24,
                format: 'unorm8x4',
              },
              {
                shaderLocation: 5,
                offset: 28,
                format: 'uint32',
              },
              {
                shaderLocation: 6,
                offset: 32,
                format: 'uint32',
              },
            ],
          },
        ],
      },
      fragment: {
        module: this._shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            blend: getWebGpuBlendState(blendMode),
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    return descriptor;
  }

  // ---------------------------------------------------------------------------
  // Custom-material path
  // ---------------------------------------------------------------------------

  private _drawCustomBatch(
    pass: GPURenderPassEncoder,
    device: GPUDevice,
    backend: WebGpuBackend,
    material: SpriteMaterial,
    transformBindGroup: GPUBindGroup,
    stencil: boolean,
  ): void {
    const resources = this._getOrCreateCustomResources(material, device);
    const baseTexture = this._currentBaseTexture ?? Texture.empty;

    // Re-built every frame so mutations to material.uniforms.X are picked up.
    this._uploadUserUniforms(material, resources, device);

    const pipeline = this._getOrCreateCustomPipeline(resources, this._currentBlendMode!, backend.renderTargetFormat, stencil, device);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, transformBindGroup);
    pass.setBindGroup(1, this._getCustomBaseTextureBindGroup(resources, backend, baseTexture, device));
    pass.setBindGroup(2, this._buildUserBindGroup(material, resources, backend, device));
    pass.setVertexBuffer(0, this._instanceBuffer);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');
    pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);
  }

  private _getOrCreateCustomResources(material: SpriteMaterial, device: GPUDevice): CustomSpriteResources {
    const existing = this._customMaterials.get(material);

    if (existing !== undefined) {
      return existing;
    }

    const wgsl = material.shader.wgsl;

    if (wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The engine owns the vertex stage: prepend the canonical sprite vertex
    // module (VertexInput/VertexOutput, group(0) projection + transform storage,
    // group(1) base texture + sampler) to the material's fragment WGSL.
    const shaderModule = device.createShaderModule({ code: `${spriteVertexWgsl}\n${wgsl}` });
    const userLayout = this._buildUserBindGroupLayout(device, material);
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout!, this._customBaseTextureLayout!, userLayout],
    });

    const resources: CustomSpriteResources = {
      shaderModule,
      userLayout,
      pipelineLayout,
      pipelines: new Map(),
      userUniformBuffer: null,
      userUniformBufferCapacity: 0,
      baseTextureBindGroups: new WeakMap(),
    };

    this._customMaterials.set(material, resources);

    material._onDispose(() => {
      const stored = this._customMaterials.get(material);

      if (stored !== undefined) {
        this._releaseCustomResources(stored);
        this._customMaterials.delete(material);
      }
    });

    return resources;
  }

  private _getOrCreateCustomPipeline(
    resources: CustomSpriteResources,
    blendMode: BlendModes,
    format: GPUTextureFormat,
    stencil: boolean,
    device: GPUDevice,
  ): GPURenderPipeline {
    const cacheKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existing = resources.pipelines.get(cacheKey);

    if (existing !== undefined) {
      return existing;
    }

    const descriptor: GPURenderPipelineDescriptor = {
      layout: resources.pipelineLayout,
      vertex: {
        module: resources.shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: instanceStrideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 3, offset: 16, format: 'unorm16x4' },
              { shaderLocation: 4, offset: 24, format: 'unorm8x4' },
              { shaderLocation: 5, offset: 28, format: 'uint32' },
              { shaderLocation: 6, offset: 32, format: 'uint32' },
            ],
          },
        ],
      },
      fragment: {
        module: resources.shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            blend: getWebGpuBlendState(blendMode),
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = device.createRenderPipeline(descriptor);

    resources.pipelines.set(cacheKey, pipeline);

    return pipeline;
  }

  private _getCustomBaseTextureBindGroup(
    resources: CustomSpriteResources,
    backend: WebGpuBackend,
    texture: Texture | RenderTexture,
    device: GPUDevice,
  ): GPUBindGroup {
    // Resolve the binding every call so a mutable base texture uploads its
    // dirty region before sampling; reuse the cached group only while the
    // underlying view is unchanged (the backend swaps it on texture resize).
    const binding = backend.getTextureBinding(texture);
    const existing = resources.baseTextureBindGroups.get(texture);

    if (existing?.view === binding.view) {
      return existing.group;
    }

    const group = device.createBindGroup({
      layout: this._customBaseTextureLayout!,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });

    resources.baseTextureBindGroups.set(texture, { group, view: binding.view });

    return group;
  }

  private _buildUserBindGroupLayout(device: GPUDevice, material: SpriteMaterial): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [];

    // Binding 0 always reserved for the user UBO (even if empty), so the layout
    // is stable across user-uniform mutations.
    entries.push({
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    });

    const textureBindings = collectTextureBindings(material);

    if (textureBindings.length > maxCustomTextureSlots) {
      throw new Error(`SpriteMaterial requested more than ${maxCustomTextureSlots} user texture bindings.`);
    }

    let bindingIndex = 1;

    for (let t = 0; t < textureBindings.length; t++) {
      entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
      bindingIndex++;
      entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
      bindingIndex++;
    }

    return device.createBindGroupLayout({ entries });
  }

  private _uploadUserUniforms(material: SpriteMaterial, resources: CustomSpriteResources, device: GPUDevice): void {
    const scalarValues = collectScalarUniforms(material);

    // Always create a UBO (even if empty) since binding 0 of the user layout is
    // fixed. Min size 16 bytes to satisfy WebGPU's minimum buffer size.
    const slotCount = Math.max(scalarValues.length, 1);
    const bufferBytes = slotCount * 16;

    if (resources.userUniformBuffer === null || resources.userUniformBufferCapacity < bufferBytes) {
      resources.userUniformBuffer?.destroy();
      resources.userUniformBufferCapacity = bufferBytes;
      resources.userUniformBuffer = device.createBuffer({
        size: bufferBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    const data = new Float32Array(bufferBytes / 4);

    let slot = 0;

    for (const value of scalarValues) {
      const baseFloatIndex = slot * 4;

      if (typeof value === 'number') {
        data[baseFloatIndex] = value;
      } else if (value instanceof Float32Array) {
        data.set(value, baseFloatIndex);
      } else if (value instanceof Int32Array) {
        for (let i = 0; i < value.length; i++) {
          data[baseFloatIndex + i] = value[i]!;
        }
      } else {
        const arr = value as readonly number[];

        for (let i = 0; i < arr.length; i++) {
          data[baseFloatIndex + i] = arr[i]!;
        }
      }

      slot++;
    }

    device.queue.writeBuffer(resources.userUniformBuffer, 0, data);
  }

  private _buildUserBindGroup(material: SpriteMaterial, resources: CustomSpriteResources, backend: WebGpuBackend, device: GPUDevice): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [];

    entries.push({ binding: 0, resource: { buffer: resources.userUniformBuffer! } });

    let bindingIndex = 1;

    for (const texture of collectTextureBindings(material)) {
      const binding = backend.getTextureBinding(texture);
      entries.push({ binding: bindingIndex, resource: binding.view });
      bindingIndex++;
      entries.push({ binding: bindingIndex, resource: binding.sampler });
      bindingIndex++;
    }

    return device.createBindGroup({ layout: resources.userLayout, entries });
  }

  private _releaseCustomResources(resources: CustomSpriteResources): void {
    resources.userUniformBuffer?.destroy();
    resources.pipelines.clear();
    resources.userUniformBuffer = null;
    resources.userUniformBufferCapacity = 0;
    resources.baseTextureBindGroups = new WeakMap();
  }
}

function isTextureUniform(value: UniformValue): value is Texture | RenderTexture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'width' in value &&
    'height' in value &&
    !(value instanceof Float32Array) &&
    !(value instanceof Int32Array) &&
    !Array.isArray(value)
  );
}

/** Scalar/vector/matrix uniforms (texture values excluded) in declaration order. */
function collectScalarUniforms(material: SpriteMaterial): Array<Exclude<UniformValue, Texture | RenderTexture>> {
  const result: Array<Exclude<UniformValue, Texture | RenderTexture>> = [];

  for (const value of Object.values(material.uniforms)) {
    if (!isTextureUniform(value)) {
      result.push(value);
    }
  }

  return result;
}

/**
 * Texture bindings claimed by the material, in a stable order: texture-valued
 * entries of `uniforms` first (declaration order), then the dedicated
 * `textures` map. The WGSL source must declare its `@group(2)` texture/sampler
 * pairs in this same order.
 */
function collectTextureBindings(material: SpriteMaterial): Array<Texture | RenderTexture> {
  const result: Array<Texture | RenderTexture> = [];

  for (const value of Object.values(material.uniforms)) {
    if (isTextureUniform(value)) {
      result.push(value);
    }
  }

  for (const texture of Object.values(material.textures)) {
    result.push(texture);
  }

  return result;
}
