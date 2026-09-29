import type { GpuResourceAccountant } from '#rendering/GpuResourceAccountant';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import { isFullyOpaqueLevel } from '#rendering/texture/pixelPayload';

import normalizeWgslModule from './shaders/texture-normalize.wgsl';

/** WGSL source for the managed-colour normalization pipeline. @internal */
export const textureNormalizeWgsl: string = normalizeWgslModule;

/** Bytes per texel of a managed colour staging texture. */
const RGBA8_BYTES_PER_TEXEL = 4;

/**
 * One authored mip level. Structurally the payload's own level record, so a
 * chain can be handed over without being copied; the mip index is its position.
 */
export interface WebGpuColorNormalizationLevel {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

interface NormalizeStaging {
  texture: GPUTexture;
  width: number;
  height: number;
  accountedBytes: number;
}

interface NormalizeResources {
  readonly bindGroupLayout: GPUBindGroupLayout;
  readonly pipeline: GPURenderPipeline;
  readonly sampler: GPUSampler;
}

/** A level's address within a pass, without the payload it came from. */
interface PassLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
}
/**
 * The upload-time alpha normalization pass for managed colour textures, on
 * WebGPU.
 *
 * Managed uncompressed colour is premultiplied in linear light BEFORE any
 * filtering can observe it: the straight source is copied into a staging texture
 * of the destination's own storage format, and one unblended 1:1 render pass
 * multiplies RGB by alpha on the way in. An sRGB attachment therefore keeps
 * `E(linearRGB * alpha)` rather than `E(linearRGB) * alpha`.
 *
 * Numerically identical to the WebGL2 half - the same multiply on hardware-
 * decoded values, written back to a same-format attachment - which is what makes
 * the two backends' filtered results agree.
 *
 * Mips are normalized level by level, so every generated level is a downsample of
 * already-premultiplied texels.
 *
 * Not a {@link Filter} and not public: the backend owns it and decides when a
 * source needs it.
 * @internal
 */
export class WebGpuTextureNormalizer {
  private readonly _device: GPUDevice;
  private readonly _accountant: GpuResourceAccountant | null;
  /** Straight-source scratch, one per storage format, grown only. */
  private readonly _staging = new Map<GPUTextureFormat, NormalizeStaging>();
  /** Per-format pipeline and sampler, shaped like the mipmap resources. */
  private readonly _resources = new Map<GPUTextureFormat, NormalizeResources>();
  /** One uniform buffer per distinct staging/level extent pair. */
  private readonly _levelScales = new Map<string, GPUBuffer>();
  /** Reused per level so the uniform write allocates nothing. */
  private readonly _levelScaleData = new Float32Array(4);

  /**
   * @param accountant Books each staging texture, so scratch memory is part of the
   * backend's owned-byte total for as long as it is resident.
   */
  public constructor(device: GPUDevice, accountant: GpuResourceAccountant | null = null) {
    this._device = device;
    this._accountant = accountant;
  }

  /**
   * Premultiply an authored chain, in one command buffer.
   *
   * A level whose alpha is uniformly opaque keeps the plain `writeTexture` path:
   * premultiplying it would be a no-op, and a pass per level is not free. Every
   * level that does need a pass is staged into the same scratch texture first, so
   * a chain costs one staging allocation and one submit.
   */
  public normalizeLevels(destination: GPUTexture, format: GPUTextureFormat, levels: readonly WebGpuColorNormalizationLevel[]): void {
    let passLevelCount = 0;
    let stagingWidth = 0;
    let stagingHeight = 0;

    for (const [mipLevel, level] of levels.entries()) {
      if (isFullyOpaqueLevel(level.data)) {
        this._device.queue.writeTexture(
          { texture: destination, mipLevel },
          level.data,
          { bytesPerRow: level.width * RGBA8_BYTES_PER_TEXEL, rowsPerImage: level.height },
          { width: level.width, height: level.height },
        );
        continue;
      }

      passLevelCount++;
      stagingWidth = Math.max(stagingWidth, level.width);
      stagingHeight = Math.max(stagingHeight, level.height);
    }

    if (passLevelCount === 0) {
      return;
    }

    const staging = this._ensureStaging(format, stagingWidth, stagingHeight);
    const encoder = this._device.createCommandEncoder({ label: 'backend:color-normalize-encoder' });

    for (const [mipLevel, level] of levels.entries()) {
      if (isFullyOpaqueLevel(level.data)) {
        continue;
      }

      this._device.queue.writeTexture(
        { texture: staging.texture },
        level.data,
        { bytesPerRow: level.width * RGBA8_BYTES_PER_TEXEL, rowsPerImage: level.height },
        { width: level.width, height: level.height },
      );
      this._recordPass(encoder, staging, destination, format, { level: mipLevel, width: level.width, height: level.height });
    }

    this._device.queue.submit([encoder.finish()]);
  }

  /**
   * Premultiply a single level copied from a browser image source.
   *
   * The external-image copy declares its own meaning rather than relying on a
   * default: `premultipliedAlpha: false` says the bytes are STRAIGHT, so the pass
   * - not the copy - is what associates them.
   */
  public normalizeImageSource(destination: GPUTexture, format: GPUTextureFormat, width: number, height: number, source: GPUCopyExternalImageSource): void {
    const staging = this._ensureStaging(format, width, height, true);

    this._device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture: staging.texture, premultipliedAlpha: false }, { width, height });

    const encoder = this._device.createCommandEncoder({ label: 'backend:color-normalize-encoder' });

    this._recordPass(encoder, staging, destination, format, { level: 0, width, height });

    this._device.queue.submit([encoder.finish()]);
  }

  /**
   * Premultiply a single level whose straight bytes are already on the CPU.
   *
   * This is the path a canvas readback takes: the engine has the pixels because
   * `copyExternalImageToTexture` cannot be trusted on this browser, not because
   * the source was a raw payload. It must not colour-convert - a numeric data
   * source never reaches here, because {@link WebGpuBackend} only asks for a pass
   * for content it has resolved as colour.
   */
  public normalizeStagedBytes(destination: GPUTexture, format: GPUTextureFormat, width: number, height: number, data: Uint8ClampedArray | Uint8Array): void {
    const staging = this._ensureStaging(format, width, height, true);

    this._device.queue.writeTexture(
      { texture: staging.texture },
      data,
      { bytesPerRow: width * RGBA8_BYTES_PER_TEXEL, rowsPerImage: height },
      { width, height },
    );

    const encoder = this._device.createCommandEncoder({ label: 'backend:color-normalize-encoder' });

    this._recordPass(encoder, staging, destination, format, { level: 0, width, height });

    this._device.queue.submit([encoder.finish()]);
  }

  /**
   * Drop every device-owned object, for a lost or replaced device. Unlike
   * {@link destroy} this leaves the instance usable: the next upload rebuilds
   * against the new device.
   */
  public reset(): void {
    for (const staging of this._staging.values()) {
      staging.texture.destroy();
      this._accountant?.free(staging.accountedBytes);
    }

    for (const buffer of this._levelScales.values()) {
      buffer.destroy();
    }

    this._staging.clear();
    this._resources.clear();
    this._levelScales.clear();
  }

  public destroy(): void {
    this.reset();
  }

  private _recordPass(encoder: GPUCommandEncoder, staging: NormalizeStaging, destination: GPUTexture, format: GPUTextureFormat, level: PassLevel): void {
    const resources = this._getResources(format);
    const bindGroup = this._device.createBindGroup({
      label: 'backend:color-normalize-bind-group',
      layout: resources.bindGroupLayout,
      entries: [
        { binding: 0, resource: staging.texture.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
        { binding: 1, resource: resources.sampler },
        { binding: 2, resource: { buffer: this._levelScaleBuffer(staging.width, staging.height, level.width, level.height) } },
      ],
    });
    const pass = encoder.beginRenderPass({
      label: 'backend:color-normalize-pass',
      colorAttachments: [
        {
          view: destination.createView({ baseMipLevel: level.level, mipLevelCount: 1 }),
          // The pass writes every texel of the level, so the clear only gives the
          // attachment a defined starting value.
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(resources.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  /**
   * Keep one staging texture per format large enough for the levels being staged,
   * reallocating only when one does not fit. `exact` reallocates at the requested
   * extent even when it fits, which is what a single-level external copy needs
   * because `copyExternalImageToTexture` sizes its destination to the source.
   */
  private _ensureStaging(format: GPUTextureFormat, width: number, height: number, exact = false): NormalizeStaging {
    const existing = this._staging.get(format);
    const fits = existing !== undefined && existing.width >= width && existing.height >= height;

    if (existing !== undefined && fits && !exact) {
      return existing;
    }

    const nextWidth = exact ? width : Math.max(existing?.width ?? 0, width);
    const nextHeight = exact ? height : Math.max(existing?.height ?? 0, height);

    if (existing !== undefined) {
      existing.texture.destroy();
      this._accountant?.free(existing.accountedBytes);
    }

    const texture = this._device.createTexture({
      label: 'backend:color-normalize-staging',
      size: { width: nextWidth, height: nextHeight },
      format,
      // RENDER_ATTACHMENT is not there for rendering: `copyExternalImageToTexture`
      // requires it on every destination it writes.
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const accountedBytes = nextWidth * nextHeight * RGBA8_BYTES_PER_TEXEL;
    const staging: NormalizeStaging = { texture, width: nextWidth, height: nextHeight, accountedBytes };

    this._accountant?.allocate(accountedBytes);

    this._staging.set(format, staging);

    return staging;
  }

  private _getResources(format: GPUTextureFormat): NormalizeResources {
    const existing = this._resources.get(format);

    if (existing !== undefined) {
      return existing;
    }

    const device = this._device;

    try {
      const shaderModule = device.createShaderModule({ label: 'backend:color-normalize-shader', code: textureNormalizeWgsl });
      const bindGroupLayout = device.createBindGroupLayout({
        label: 'backend:color-normalize-bind-group-layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      });
      const pipelineLayout = device.createPipelineLayout({
        label: 'backend:color-normalize-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      });
      const pipeline = device.createRenderPipeline({
        label: 'backend:color-normalize-pipeline',
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: 'vertexMain' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          // No blend state, so the pass cannot blend the normalized texel with
          // whatever the level held instead of replacing it.
          targets: [{ format, writeMask: GPUColorWrite.ALL }],
        },
        primitive: { topology: 'triangle-list' },
      });
      const sampler = device.createSampler({
        label: 'backend:color-normalize-sampler',
        magFilter: 'nearest',
        minFilter: 'nearest',
        mipmapFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
      const resources: NormalizeResources = { bindGroupLayout, pipeline, sampler };

      this._resources.set(format, resources);

      return resources;
    } catch (error) {
      throw new RenderError({
        code: 'pipeline-creation',
        backendType: RenderBackendType.WebGpu,
        message: `Colour normalization could not create its pipeline for '${format}': ${error instanceof Error ? error.message : String(error)}`,
        detail: textureNormalizeWgsl,
      });
    }
  }

  /**
   * The uniform carrying what fraction of the staging texture this level fills.
   *
   * Keyed on the pair, so a chain reuses one buffer per level extent across
   * uploads instead of allocating per upload. A new extent is a new buffer, which
   * bounds the map by the number of distinct mip sizes a session has staged.
   */
  private _levelScaleBuffer(stagingWidth: number, stagingHeight: number, levelWidth: number, levelHeight: number): GPUBuffer {
    const key = `${levelWidth}x${levelHeight}@${stagingWidth}x${stagingHeight}`;
    const existing = this._levelScales.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const data = this._levelScaleData;

    data[0] = levelWidth / stagingWidth;
    data[1] = levelHeight / stagingHeight;
    data[2] = 0;
    data[3] = 0;

    const buffer = this._device.createBuffer({
      label: 'backend:color-normalize-level-scale',
      size: data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._device.queue.writeBuffer(buffer, 0, data);
    this._levelScales.set(key, buffer);

    return buffer;
  }
}
