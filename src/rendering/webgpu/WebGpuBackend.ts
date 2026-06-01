/* eslint-disable max-lines */
/// <reference types="@webgpu/types" />

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Signal } from '@/core/Signal';
import type { Matrix } from '@/math/Matrix';
import type { Rectangle } from '@/math/Rectangle';
import { Vector } from '@/math/Vector';
import { ParticleSystem } from '@/particles/ParticleSystem';
import { BitmapText } from '@/rendering/text/BitmapText';
import { Text } from '@/rendering/text/Text';
import type { BlendModes } from '@/rendering/types';
import { ScaleModes, WrapModes } from '@/rendering/types';

import type { Drawable } from '../Drawable';
import type { Geometry } from '../geometry/Geometry';
import { Mesh } from '../mesh/Mesh';
import { type DrawCommand, drawCommandUsesSharedTransform } from '../plan/RenderCommand';
import type { RenderGroup } from '../plan/RenderInstruction';
import type { RenderBackend } from '../RenderBackend';
import { RenderBackendType } from '../RenderBackendType';
import type { Renderer } from '../Renderer';
import { RendererRegistry } from '../RendererRegistry';
import type { RenderPass } from '../RenderPass';
import type { RenderStats } from '../RenderStats';
import { createRenderStats, resetRenderStats } from '../RenderStats';
import { RenderTarget } from '../RenderTarget';
import { Sprite } from '../sprite/Sprite';
import { DataTexture, type DataTextureFormat } from '../texture/DataTexture';
import { RenderTexture } from '../texture/RenderTexture';
import type { Texture } from '../texture/Texture';
import type { View } from '../View';
import { WebGpuMaskCompositor } from './WebGpuMaskCompositor';
import { WebGpuMeshRenderer } from './WebGpuMeshRenderer';
import { WebGpuParticleRenderer } from './WebGpuParticleRenderer';
import { WebGpuPassCoordinator } from './WebGpuPassCoordinator';
import { WebGpuSpriteRenderer } from './WebGpuSpriteRenderer';
import { WebGpuTextRenderer } from './WebGpuTextRenderer';
import { WebGpuTransformStorage } from './WebGpuTransformStorage';

interface ManagedWebGpuTextureState {
  texture: GPUTexture;
  view: GPUTextureView;
  sampler: GPUSampler;
  version: number;
  width: number;
  height: number;
  mipLevelCount: number;
  hasContent: boolean;
}

interface PixelClipBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const managedTextureFormat: GPUTextureFormat = 'rgba8unorm';

/**
 * WebGPU implementation of {@link RenderBackend}. Manages the GPU device,
 * canvas context configuration, format selection, managed-texture cache
 * (sized + format-aware), pre-warmed render pipelines per (blend-mode ×
 * format) combination, the scissor stack, and a mipmap-generation
 * compute path. Dispatches draws to per-drawable WebGPU renderers
 * registered in the {@link RendererRegistry}.
 *
 * Detects device loss via the platform's `device.lost` Promise and
 * automatically attempts recovery: drops dead GPU state, requests a
 * fresh adapter+device with exponential backoff (up to 5 tries), then
 * fires {@link WebGpuBackend.onDeviceRestored}. While recovering, draw
 * submissions silently no-op so user code survives transient outages
 * without explicit error handling.
 *
 * Initialization is async ({@link WebGpuBackend.initialize}); the
 * {@link Application} class drives that during `start()` and
 * automatically falls back to {@link WebGl2Backend} when adapter
 * acquisition fails on `'auto'`.
 */
export class WebGpuBackend implements RenderBackend {
  public readonly backendType = RenderBackendType.WebGpu;
  public readonly rendererRegistry = new RendererRegistry<WebGpuBackend>();
  public readonly onDeviceLost = new Signal<[GPUDeviceLostInfo]>();
  public readonly onDeviceRestored = new Signal();

  private readonly _canvas: HTMLCanvasElement;
  private readonly _rootRenderTarget: RenderTarget;
  private _clearColor: Color = new Color();
  private _deviceLost = false;
  private _isRecovering = false;
  private _destroyed = false;
  private _recoveryAttempt = 0;
  private _maxRecoveryAttempts = 5;
  private _recoveryBackoffMs = 100;
  private readonly _textureStates: Map<Texture | RenderTexture, ManagedWebGpuTextureState> = new Map<Texture | RenderTexture, ManagedWebGpuTextureState>();
  private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
  private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
  private readonly _temporaryRenderTextures: RenderTexture[] = [];
  private readonly _clipBoundsStack: Rectangle[] = [];
  private readonly _clipPixelStack: PixelClipBoundsState[] = [];
  private readonly _clipPointA: Vector = new Vector();
  private readonly _clipPointB: Vector = new Vector();
  private readonly _maskCompositor: WebGpuMaskCompositor = new WebGpuMaskCompositor();
  private _maskCompositorConnected = false;
  private _mipmapShaderModule: GPUShaderModule | null = null;
  private _mipmapBindGroupLayout: GPUBindGroupLayout | null = null;
  private _mipmapPipelineLayout: GPUPipelineLayout | null = null;
  private _mipmapPipeline: GPURenderPipeline | null = null;
  private _mipmapSampler: GPUSampler | null = null;
  private _context: GPUCanvasContext | null = null;
  private _device: GPUDevice | null = null;
  private _format: GPUTextureFormat | null = null;
  private _initializePromise: Promise<this> | null = null;
  private _renderTarget: RenderTarget;
  private _renderer: Renderer | null = null;
  private _texture: Texture | RenderTexture | null = null;
  private _clearRequested = false;
  private _hasPresentedFrame = false;
  private readonly _stats: RenderStats = createRenderStats();
  private _transformStorage: WebGpuTransformStorage | null = new WebGpuTransformStorage();
  private _activeDrawCommand: DrawCommand | null = null;
  private _passCoordinatorInstance: WebGpuPassCoordinator | null = null;
  private _drawPlanDepth = 0;

  public constructor(app: Application) {
    const canvasOptions = app.options.canvas ?? {};
    const width = canvasOptions.width ?? 800;
    const height = canvasOptions.height ?? 600;
    const clearColor = app.options.clearColor;

    this._canvas = app.canvas;
    this._rootRenderTarget = new RenderTarget(width, height, true);
    this._renderTarget = this._rootRenderTarget;

    if (clearColor) {
      this._clearColor.copy(clearColor);
    }

    this.rendererRegistry.registerRenderer(Sprite, new WebGpuSpriteRenderer());
    this.rendererRegistry.registerRenderer(Mesh, new WebGpuMeshRenderer());
    this.rendererRegistry.registerRenderer(ParticleSystem, new WebGpuParticleRenderer());
    this.rendererRegistry.registerRenderer(Text, new WebGpuTextRenderer());
    this.rendererRegistry.registerRenderer(BitmapText, new WebGpuTextRenderer());
    this.resize(width, height);
  }

  public get view(): View {
    return this._renderTarget.view;
  }

  public get renderTarget(): RenderTarget {
    return this._renderTarget;
  }

  public get device(): GPUDevice {
    if (this._device === null) {
      throw new Error('WebGPU device is not initialized yet.');
    }

    return this._device;
  }

  public get context(): GPUCanvasContext {
    if (this._context === null) {
      throw new Error('WebGPU canvas context is not initialized yet.');
    }

    return this._context;
  }

  public get format(): GPUTextureFormat {
    if (this._format === null) {
      throw new Error('WebGPU canvas format is not initialized yet.');
    }

    return this._format;
  }

  public get renderTargetFormat(): GPUTextureFormat {
    return this._renderTarget === this._rootRenderTarget ? this.format : managedTextureFormat;
  }

  public get clearRequested(): boolean {
    return this._clearRequested;
  }

  public get stats(): RenderStats {
    return this._stats;
  }

  /** @internal */
  public get activeDrawCommand(): DrawCommand | null {
    return this._activeDrawCommand;
  }

  /**
   * Internal render-pass coordinator. Owns the clear-vs-load decision and (from
   * phase 12D) the active render pass; not part of the public
   * {@link RenderBackend} surface.
   * @internal
   */
  public get _passCoordinator(): WebGpuPassCoordinator {
    return (this._passCoordinatorInstance ??= new WebGpuPassCoordinator(this));
  }

  public get clearColor(): Color {
    return this._clearColor;
  }

  public get deviceLost(): boolean {
    return this._deviceLost;
  }

  public setClearColor(color: Color): this {
    this._clearColor.copy(color);

    return this;
  }

  public initialize(): Promise<this> {
    if (!this._initializePromise) {
      this._initializePromise = this._initialize().catch((error: unknown) => {
        this._initializePromise = null;
        throw error;
      });
    }

    return this._initializePromise;
  }

  public resetStats(): this {
    resetRenderStats(this._stats);

    return this;
  }

  /** @internal */
  public _beginDrawPlan(nodeCount: number): void {
    const storage = this._getTransformStorage();

    storage.begin(nodeCount);

    // Pre-allocate the GPU storage buffer for the full plan before any group
    // flush runs. Without this, a later flush with a higher maxNodeIndex would
    // destroy and replace the buffer mid-frame while earlier command buffers
    // may still reference the old allocation.
    if (nodeCount > 0 && this._device !== null && !this._deviceLost) {
      storage.reserve(this._device, nodeCount);
    }

    this._activeDrawCommand = null;
    this._drawPlanDepth++;
  }

  /** @internal */
  public _prepareRenderGroupUpload(group: RenderGroup): void {
    // Pack the whole render group's world transforms (+ tint) into the shared
    // transform storage at the group's upload boundary, keyed by each draw
    // command's stable nodeIndex. Every draw the player will submit for this
    // group is covered here, before the group's first draw.
    //
    // Renderers that pack their own per-node data (Text, Particle) never read
    // the shared storage, so their commands are skipped — no consuming draw
    // ever references their slots (nodeIndex is unique per command).
    const storage = this._getTransformStorage();
    const instructions = group.instructions;

    for (let i = 0; i < instructions.length; i++) {
      const command = instructions[i];

      if (drawCommandUsesSharedTransform(command, this)) {
        storage.writeCommand(command);
      } else {
        storage.recordSkippedWrite();
      }
    }
  }

  /** @internal */
  public _prepareDrawCommand(command: DrawCommand): void {
    // Transform packing now happens at the render-group upload boundary
    // (`_prepareRenderGroupUpload`); this hook only tracks the active draw so
    // renderers can read the current command's nodeIndex.
    this._activeDrawCommand = command;
  }

  /** @internal */
  public _endDrawPlan(): void {
    this._activeDrawCommand = null;

    if (this._drawPlanDepth > 0) {
      this._drawPlanDepth--;
    }

    // Only assert balance at the outermost plan: a nested render() (e.g.
    // cacheAsBitmap drawing its cache sprite) sees the still-open outer clips,
    // which are not leaks.
    if (this._drawPlanDepth === 0 && this._passCoordinatorInstance !== null) {
      const unbalanced = this._passCoordinatorInstance.unbalancedStencilClips();

      if (unbalanced > 0) {
        this._passCoordinatorInstance.resetStencil();
        throw new Error(`Unbalanced stencil clip stack at end of frame (${unbalanced} unpopped clip(s)).`);
      }
    }
  }

  public draw(drawable: Drawable): this {
    if (this._deviceLost || this._device === null) {
      this._activeDrawCommand = null;
      return this;
    }

    const renderer = this.rendererRegistry.resolve(drawable);

    this._setActiveRenderer(renderer);
    renderer.render(drawable);
    this._activeDrawCommand = null;
    this._stats.submittedNodes++;

    return this;
  }

  public execute(pass: RenderPass): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    this._flushActiveRenderer();
    this._stats.renderPasses++;
    pass.execute(this);

    return this;
  }

  public setBlendMode(_blendMode: BlendModes | null): this {
    // Blend mode is baked into WebGPU render pipelines at creation time.
    // This method is a no-op; renderers use the blend mode directly when
    // selecting or creating their pipelines.
    return this;
  }

  public setRenderTarget(target: RenderTarget | null): this {
    const nextRenderTarget = target ?? this._rootRenderTarget;

    if (this._renderTarget !== nextRenderTarget) {
      this._flushActiveRenderer();

      if (this._renderTarget !== this._rootRenderTarget) {
        this._unsubscribeRenderTarget(this._renderTarget);
      }

      this._renderTarget = nextRenderTarget;
      this._stats.renderTargetChanges++;

      if (nextRenderTarget !== this._rootRenderTarget) {
        this._subscribeRenderTarget(nextRenderTarget);
      }
    }

    return this;
  }

  public pushScissorRect(bounds: Rectangle): this {
    this._flushActiveRenderer();

    this._clipBoundsStack.push(bounds.clone());

    const nextClip = this._toClipPixels(bounds);
    const previousClip = this._clipPixelStack.length > 0 ? this._clipPixelStack[this._clipPixelStack.length - 1] : null;
    const resolvedClip = previousClip ? this._intersectClips(previousClip, nextClip) : nextClip;

    this._clipPixelStack.push(resolvedClip);

    return this;
  }

  public composeWithAlphaMask(
    content: Texture | RenderTexture,
    mask: Texture | RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: BlendModes,
  ): this {
    if (width <= 0 || height <= 0) {
      return this;
    }

    if (this._deviceLost || this._device === null) {
      return this;
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._maskCompositorConnected) {
      this._maskCompositor.connect(this.device);
      this._maskCompositorConnected = true;
    }

    this._maskCompositor.compose(this, content, mask, x, y, width, height, blendMode);

    return this;
  }

  public popScissorRect(): this {
    if (this._clipBoundsStack.length === 0) {
      return this;
    }

    this._flushActiveRenderer();

    const removedClip = this._clipBoundsStack.pop();

    if (removedClip) {
      removedClip.destroy();
    }

    this._clipPixelStack.pop();

    return this;
  }

  public pushStencilClip(shape: Geometry, transform: Matrix): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    // Geometric stencil clipping is owned by the pass coordinator: it shares a
    // per-target depth/stencil attachment across the clip scope's passes and
    // draws the shape silhouette into the stencil aspect. Content renderers
    // select stencil-enabled pipeline variants while the clip is in effect.
    this._flushActiveRenderer();
    this._setActiveRenderer(null);
    this._passCoordinator.pushStencilClip(shape, transform);

    return this;
  }

  public popStencilClip(): this {
    if (this._deviceLost || this._device === null) {
      return this;
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);
    this._passCoordinator.popStencilClip();

    return this;
  }

  public getScissorRect(): PixelClipBoundsState | null {
    if (this._clipPixelStack.length === 0) {
      return null;
    }

    const clip = this._clipPixelStack[this._clipPixelStack.length - 1];
    const scaleX = this._renderTarget.root && this._renderTarget.width > 0 ? this._canvas.width / this._renderTarget.width : 1;
    const scaleY = this._renderTarget.root && this._renderTarget.height > 0 ? this._canvas.height / this._renderTarget.height : 1;

    return {
      x: Math.floor(clip.x * scaleX),
      y: Math.floor(clip.y * scaleY),
      width: Math.max(0, Math.round(clip.width * scaleX)),
      height: Math.max(0, Math.round(clip.height * scaleY)),
    };
  }

  public acquireRenderTexture(width: number, height: number): RenderTexture {
    for (let index = 0; index < this._temporaryRenderTextures.length; index++) {
      const texture = this._temporaryRenderTextures[index];

      if (texture.width === width && texture.height === height) {
        this._temporaryRenderTextures.splice(index, 1);

        return texture;
      }
    }

    return new RenderTexture(width, height);
  }

  public releaseRenderTexture(texture: RenderTexture): this {
    if (this._temporaryRenderTextures.includes(texture)) {
      return this;
    }

    texture.setView(null);
    this._temporaryRenderTextures.push(texture);

    return this;
  }

  public setView(view: View | null): this {
    this._flushActiveRenderer();
    this._renderTarget.setView(view);

    return this;
  }

  public clear(color?: Color): this {
    if (color) {
      this.setClearColor(color);
    }

    this._clearRequested = true;

    return this;
  }

  public resize(width: number, height: number): this {
    this._rootRenderTarget.resize(width, height);
    this._hasPresentedFrame = false;

    return this;
  }

  public flush(): this {
    if (!this._device || !this._context) {
      return this;
    }

    if (this._renderer) {
      this._flushActiveRenderer();
    } else if (this._clearRequested) {
      // No active renderer but a clear is pending: open an empty coordinator
      // pass so createColorAttachment consumes the clear state once.
      this._passCoordinator.acquirePass();
      this._passCoordinator.endPass();
    }

    return this;
  }

  public destroy(): void {
    this._destroyed = true;
    this.onDeviceLost.destroy();
    this.onDeviceRestored.destroy();
    this._setActiveRenderer(null);
    this.rendererRegistry.destroy();
    this._destroyManagedTextures();
    this._destroyTemporaryRenderTextures();

    for (const clipBounds of this._clipBoundsStack) {
      clipBounds.destroy();
    }

    this._clipBoundsStack.length = 0;
    this._clipPixelStack.length = 0;
    this._clipPointA.destroy();
    this._clipPointB.destroy();

    if (this._maskCompositorConnected) {
      this._maskCompositor.disconnect();
      this._maskCompositorConnected = false;
    }

    this._transformStorage?.destroy();
    this._transformStorage = null;
    this._activeDrawCommand = null;
    this._passCoordinatorInstance?.destroyStencil();
    this._drawPlanDepth = 0;

    for (const target of [...this._renderTargetDestroyHandlers.keys()]) {
      this._unsubscribeRenderTarget(target);
    }
    this._context?.unconfigure();
    this._context = null;
    this._device = null;
    this._format = null;
    this._initializePromise = null;
    this._clearRequested = false;
    this._hasPresentedFrame = false;
    this._deviceLost = false;
    this._texture = null;
    this._mipmapShaderModule = null;
    this._mipmapBindGroupLayout = null;
    this._mipmapPipelineLayout = null;
    this._mipmapPipeline = null;
    this._mipmapSampler = null;
    this._renderTarget = this._rootRenderTarget;
    this._clearColor.destroy();
    this._rootRenderTarget.destroy();
  }

  public createColorAttachment(): GPURenderPassColorAttachment {
    const renderTarget = this._renderTarget;
    let view: GPUTextureView;

    if (renderTarget === this._rootRenderTarget) {
      view = this.context.getCurrentTexture().createView();
    } else if (renderTarget instanceof RenderTexture) {
      // Sync first so a resized RenderTexture resets its content flag before the
      // coordinator resolves the load op below.
      view = this._syncTexture(renderTarget).view;
    } else {
      throw new Error('WebGPU currently supports only root targets and RenderTexture targets.');
    }

    const loadOp = this._passCoordinator.resolveLoad(renderTarget, this._clearRequested);

    this._clearRequested = false;

    return {
      view,
      clearValue: {
        r: this._clearColor.r / 255,
        g: this._clearColor.g / 255,
        b: this._clearColor.b / 255,
        a: this._clearColor.a,
      },
      loadOp,
      storeOp: 'store',
    };
  }

  public submit(commandBuffer: GPUCommandBuffer): void {
    this.device.queue.submit([commandBuffer]);

    if (this._renderTarget === this._rootRenderTarget) {
      this._hasPresentedFrame = true;
    } else if (this._renderTarget instanceof RenderTexture) {
      const state = this._syncTexture(this._renderTarget);

      state.hasContent = true;

      if (state.mipLevelCount > 1) {
        this._generateMipmaps(state.texture, state.mipLevelCount);
      }
    }
  }

  /**
   * Whether `target` already holds rendered content this frame. The canonical
   * source of the `hasPresentedFrame` (root) / per-texture `hasContent`
   * (RenderTexture) flags that drive the coordinator's clear-vs-load decision.
   * @internal
   */
  public _targetHasContent(target: RenderTarget): boolean {
    if (target === this._rootRenderTarget) {
      return this._hasPresentedFrame;
    }

    if (target instanceof RenderTexture) {
      return this._getTextureState(target).hasContent;
    }

    return false;
  }

  /**
   * Physical pixel size of `target`'s colour attachment. The root target's colour
   * attachment is `context.getCurrentTexture()`, sized to the canvas backing
   * store (logical × pixelRatio), so a geometric stencil attachment for the root
   * must match these dimensions. RenderTexture targets back their colour and
   * stencil attachments with the same (logical) size.
   * @internal
   */
  public _getAttachmentPixelSize(target: RenderTarget): { readonly width: number; readonly height: number } {
    if (target === this._rootRenderTarget) {
      return { width: this._canvas.width, height: this._canvas.height };
    }

    return { width: target.width, height: target.height };
  }

  public getTextureBinding(texture: Texture | RenderTexture): {
    readonly view: GPUTextureView;
    readonly sampler: GPUSampler;
  } {
    const state = this._syncTexture(texture);

    return {
      view: state.view,
      sampler: state.sampler,
    };
  }

  public shouldPremultiplyTextureSample(texture: Texture | RenderTexture): boolean {
    return !(texture instanceof RenderTexture) && texture.premultiplyAlpha;
  }

  /** @internal */
  public getTransformStorageBuffer(minCount: number): { readonly buffer: GPUBuffer; readonly count: number } {
    return this._getTransformStorage().getBuffer(this.device, minCount);
  }

  /**
   * Append a drawable's world transform (+ tint) to the shared transform storage
   * and return the slot it was written to. Used by instanced renderers for draws
   * that arrive without a render-group upload boundary — i.e. a direct
   * `backend.draw(drawable)` outside the plan player (`activeDrawCommand === null`),
   * where no stable `nodeIndex` was assigned. Each call allocates a fresh slot, so
   * a batch of synthetic draws does not collide on a single row.
   * @internal
   */
  public _pushTransform(drawable: Drawable): number {
    return this._getTransformStorage().push(drawable);
  }

  private _setActiveRenderer(renderer: Renderer | null): void {
    if (this._renderer !== renderer) {
      this._flushActiveRenderer();
      this._renderer = renderer;
    }
  }

  private _flushActiveRenderer(): void {
    this._renderer?.flush();
  }

  private _getTransformStorage(): WebGpuTransformStorage {
    if (this._transformStorage === null || this._transformStorage === undefined) {
      this._transformStorage = new WebGpuTransformStorage();
    }

    return this._transformStorage;
  }

  private async _initialize(): Promise<this> {
    const gpuNavigator = this._getGpuNavigator();

    if (gpuNavigator === null) {
      throw new Error('This browser does not support WebGPU.');
    }

    if (typeof gpuNavigator.gpu.requestAdapter !== 'function') {
      throw new Error('WebGPU is available, but navigator.gpu.requestAdapter is not implemented.');
    }

    if (typeof gpuNavigator.gpu.getPreferredCanvasFormat !== 'function') {
      throw new Error('WebGPU is available, but navigator.gpu.getPreferredCanvasFormat is not implemented.');
    }

    // Request the adapter before acquiring a WebGPU canvas context.
    // getContext('webgpu') is exclusive per canvas — once it succeeds, the
    // same canvas can no longer produce a WebGL2 context. Doing it the
    // other way round means an unavailable adapter still locks the canvas
    // and breaks the automatic WebGL2 fallback in Application.
    let adapter: GPUAdapter | null;

    try {
      adapter = await gpuNavigator.gpu.requestAdapter();
    } catch (error) {
      throw this._createInitializationError('Failed to request a WebGPU adapter.', error);
    }

    if (adapter === null) {
      throw new Error('Could not acquire a WebGPU adapter.');
    }

    const context = this._canvas.getContext('webgpu');

    if (context === null) {
      throw new Error('Could not create WebGPU canvas context.');
    }

    if (typeof adapter.requestDevice !== 'function') {
      throw new Error('WebGPU adapter does not expose requestDevice().');
    }

    let device: GPUDevice | null;

    try {
      device = await adapter.requestDevice();
    } catch (error) {
      throw this._createInitializationError('Failed to request a WebGPU device.', error);
    }

    if (device === null) {
      throw new Error('Could not acquire a WebGPU device.');
    }

    const format = gpuNavigator.gpu.getPreferredCanvasFormat();

    try {
      context.configure({
        device,
        format,
        alphaMode: 'opaque',
      });
    } catch (error) {
      throw this._createInitializationError('Failed to configure the WebGPU canvas context.', error);
    }

    this._context = context;
    this._device = device;
    this._format = format;
    this._hasPresentedFrame = false;
    this._subscribeToDeviceLoss();
    this.rendererRegistry.connect(this);
    this.resize(this._rootRenderTarget.width, this._rootRenderTarget.height);

    // Kick off async pipeline pre-warm for any renderer that supports
    // it. Each renderer creates its full set of (blendMode × format)
    // pipelines via createRenderPipelineAsync in parallel, so the first
    // draw call of every blend mode does not have to block on synchronous
    // pipeline creation. Renderers without a prewarmPipelines method
    // continue to create pipelines lazily on first use.
    const prewarmFormats: readonly GPUTextureFormat[] = [format, managedTextureFormat];

    await this._prewarmRendererPipelines(prewarmFormats);

    return this;
  }

  private _subscribeToDeviceLoss(): void {
    if (!this._device) {
      return;
    }

    const subscribedDevice = this._device;

    void subscribedDevice.lost.then(info => {
      // Recovery may have already replaced this._device with a fresh one;
      // the old promise still resolves when the previous device is gone.
      // Only react if the lost device is still the current one.
      if (this._destroyed || this._device !== subscribedDevice) {
        return;
      }

      this._handleDeviceLoss(info);
    });
  }

  private _handleDeviceLoss(info: GPUDeviceLostInfo): void {
    this._deviceLost = true;
    this.onDeviceLost.dispatch(info);

    // Reason 'destroyed' means destroy() was called explicitly (by us or by
    // user code). Don't try to recover — the loss is intentional.
    if (info.reason === 'destroyed') {
      return;
    }

    void this._attemptRecovery();
  }

  private async _attemptRecovery(): Promise<void> {
    if (this._isRecovering || this._destroyed) {
      return;
    }

    this._isRecovering = true;

    try {
      while (this._recoveryAttempt < this._maxRecoveryAttempts && !this._destroyed) {
        this._recoveryAttempt++;

        this._teardownDeviceState();

        try {
          await this._initialize();

          if (this._destroyed) {
            return;
          }

          this._deviceLost = false;
          this._recoveryAttempt = 0;
          // Re-cache the resolved init promise so a subsequent external
          // initialize() call returns the live state instead of running
          // a second initialization (which would tear the working
          // backend down).
          this._initializePromise = Promise.resolve(this);
          this.onDeviceRestored.dispatch();

          return;
        } catch {
          if (this._destroyed) {
            return;
          }

          const delay = this._recoveryBackoffMs * Math.pow(2, this._recoveryAttempt - 1);

          await new Promise<void>(resolve => {
            setTimeout(resolve, delay);
          });
        }
      }
    } finally {
      this._isRecovering = false;
    }
  }

  /**
   * Tear down all device-bound state in preparation for re-initialization.
   * User-facing handles (Texture, RenderTexture, RenderTarget) keep their
   * identity — their GPU-side state is rebuilt lazily on next use against
   * the new device.
   */
  private _teardownDeviceState(): void {
    // Detach destroy listeners from cached textures, then drop the cache.
    // The underlying GPUTexture objects belonged to the dead device, so we
    // do not (and cannot) call .destroy() on them — the dead device will
    // garbage-collect them. A fresh GPUTexture is created on next access.
    for (const [texture, handler] of this._textureDestroyHandlers) {
      texture.removeDestroyListener(handler);
    }

    this._textureDestroyHandlers.clear();
    this._textureStates.clear();

    // Recycled RenderTexture pool: drop entries — their backing GPUTexture
    // is gone with the dead device.
    this._temporaryRenderTextures.length = 0;

    // Disconnect renderers so they release pipelines / buffers / bind
    // groups tied to the dead device. They reconnect during _initialize().
    this.rendererRegistry.disconnect();

    if (this._maskCompositorConnected) {
      this._maskCompositor.disconnect();
      this._maskCompositorConnected = false;
    }

    // Mipmap pipeline cache is keyed to the dead device — drop it.
    this._mipmapShaderModule = null;
    this._mipmapBindGroupLayout = null;
    this._mipmapPipelineLayout = null;
    this._mipmapPipeline = null;
    this._mipmapSampler = null;
    this._transformStorage?.destroy();
    this._transformStorage = null;
    this._activeDrawCommand = null;
    // Stencil GPU resources belong to the dead device; drop them so they are
    // lazily rebuilt against the fresh device on the next clip.
    this._passCoordinatorInstance?.destroyStencil();

    this._context?.unconfigure();
    this._context = null;
    this._device = null;
    this._format = null;
    this._initializePromise = null;
    this._hasPresentedFrame = false;
  }

  private async _prewarmRendererPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const promises: Array<Promise<void>> = [];

    for (const renderer of this.rendererRegistry.renderers()) {
      const candidate = renderer as Partial<{
        prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void>;
      }>;

      if (typeof candidate.prewarmPipelines === 'function') {
        promises.push(candidate.prewarmPipelines(formats));
      }
    }

    await Promise.all(promises);
  }

  private _getGpuNavigator(): (Navigator & { gpu: GPU }) | null {
    const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU }>;

    return gpuNavigator.gpu ? gpuNavigator : null;
  }

  private _createInitializationError(message: string, error: unknown): Error {
    if (error instanceof Error && error.message.length > 0) {
      return new Error(`${message} ${error.message}`);
    }

    return new Error(message);
  }

  private _destroyManagedTextures(): void {
    for (const texture of [...this._textureStates.keys()]) {
      this._evictTexture(texture);
    }
  }

  private _destroyTemporaryRenderTextures(): void {
    for (const texture of this._temporaryRenderTextures) {
      texture.destroy();
    }

    this._temporaryRenderTextures.length = 0;
  }

  private _getTextureState(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
    let state = this._textureStates.get(texture);

    if (!state) {
      const gpuTexture = this.device.createTexture({
        size: {
          width: Math.max(texture.width, 1),
          height: Math.max(texture.height, 1),
        },
        format: this._getGpuTextureFormat(texture),
        mipLevelCount: this._getMipLevelCount(texture),
        usage: this._getTextureUsage(texture),
      });

      state = {
        texture: gpuTexture,
        view: gpuTexture.createView(),
        sampler: this._createSampler(texture),
        version: -1,
        width: texture.width,
        height: texture.height,
        mipLevelCount: this._getMipLevelCount(texture),
        hasContent: false,
      };

      const destroyHandler = (): void => {
        this._evictTexture(texture);
      };

      texture.addDestroyListener(destroyHandler);
      this._textureDestroyHandlers.set(texture, destroyHandler);
      this._textureStates.set(texture, state);
    }

    return state;
  }

  private _syncTexture(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
    if (!(texture instanceof RenderTexture) && !(texture instanceof DataTexture) && (texture.source === null || texture.width === 0 || texture.height === 0)) {
      throw new Error('WebGPU sprite rendering requires a texture with a valid source and non-zero dimensions.');
    }

    const state = this._getTextureState(texture);
    const textureVersion = texture instanceof RenderTexture ? texture.textureVersion : texture.version;
    const mipLevelCount = this._getMipLevelCount(texture);

    if (state.version !== textureVersion) {
      if (state.width !== texture.width || state.height !== texture.height || state.mipLevelCount !== mipLevelCount) {
        state.texture.destroy();

        const resizedTexture = this.device.createTexture({
          size: {
            width: texture.width,
            height: texture.height,
          },
          format: this._getGpuTextureFormat(texture),
          mipLevelCount,
          usage: this._getTextureUsage(texture),
        });

        state.texture = resizedTexture;
        state.view = resizedTexture.createView();
        state.width = texture.width;
        state.height = texture.height;
        state.mipLevelCount = mipLevelCount;
        state.hasContent = false;
      }

      state.sampler = this._createSampler(texture);

      if (texture instanceof DataTexture) {
        const formatInfo = webgpuDataTextureFormat(texture.format);
        const region = texture._consumeDirtyRegion();
        const isFullUpload = region === null || region.full || !state.hasContent;

        if (isFullUpload) {
          this.device.queue.writeTexture(
            { texture: state.texture },
            texture.buffer,
            {
              bytesPerRow: texture.width * formatInfo.bytesPerPixel,
              rowsPerImage: texture.height,
            },
            { width: texture.width, height: texture.height },
          );
        } else {
          // Partial upload: pack the dirty region into a contiguous buffer.
          const channels = formatInfo.channels;
          const bytesPerPixel = formatInfo.bytesPerPixel;
          const subBytes = region.width * region.height * bytesPerPixel;
          const subBuffer = texture.buffer instanceof Float32Array ? new Float32Array(subBytes / 4) : new Uint8Array(subBytes);
          const rowChannels = texture.width * channels;
          const subRowChannels = region.width * channels;

          for (let row = 0; row < region.height; row++) {
            const sourceStart = (region.y + row) * rowChannels + region.x * channels;
            const targetStart = row * subRowChannels;
            subBuffer.set(texture.buffer.subarray(sourceStart, sourceStart + subRowChannels), targetStart);
          }

          this.device.queue.writeTexture(
            { texture: state.texture, origin: { x: region.x, y: region.y } },
            subBuffer,
            { bytesPerRow: region.width * bytesPerPixel, rowsPerImage: region.height },
            { width: region.width, height: region.height },
          );
        }

        state.hasContent = true;
      } else if (!(texture instanceof RenderTexture)) {
        const source = texture.source!;

        this.device.queue.copyExternalImageToTexture(
          {
            source,
            flipY: false,
          },
          {
            texture: state.texture,
          },
          {
            width: texture.width,
            height: texture.height,
          },
        );

        if (state.mipLevelCount > 1) {
          this._generateMipmaps(state.texture, state.mipLevelCount);
        }
      }

      state.version = textureVersion;
    }

    return state;
  }

  private _evictTexture(texture: Texture | RenderTexture): void {
    const state = this._textureStates.get(texture);
    const destroyHandler = this._textureDestroyHandlers.get(texture);

    if (destroyHandler) {
      texture.removeDestroyListener(destroyHandler);
      this._textureDestroyHandlers.delete(texture);
    }

    if (state) {
      state.texture.destroy();
      this._textureStates.delete(texture);
    }

    if (this._texture === texture) {
      this._texture = null;
    }
  }

  private _subscribeRenderTarget(target: RenderTarget): void {
    if (!this._renderTargetDestroyHandlers.has(target)) {
      const destroyHandler = (): void => {
        if (this._renderTarget === target) {
          this._renderTarget = this._rootRenderTarget;
        }

        this._passCoordinatorInstance?.releaseStencilTarget(target);
        this._renderTargetDestroyHandlers.delete(target);
      };

      target.addDestroyListener(destroyHandler);
      this._renderTargetDestroyHandlers.set(target, destroyHandler);
    }
  }

  private _unsubscribeRenderTarget(target: RenderTarget): void {
    const destroyHandler = this._renderTargetDestroyHandlers.get(target);

    if (destroyHandler) {
      target.removeDestroyListener(destroyHandler);
      this._renderTargetDestroyHandlers.delete(target);
    }
  }

  private _toClipPixels(bounds: Rectangle): PixelClipBoundsState {
    const topLeft = this._renderTarget.mapCoordsToPixel(this._clipPointA.set(bounds.left, bounds.top));
    const bottomRight = this._renderTarget.mapCoordsToPixel(this._clipPointB.set(bounds.right, bounds.bottom));
    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);
    const targetWidth = this._renderTarget.width;
    const targetHeight = this._renderTarget.height;
    const x = Math.max(0, Math.min(targetWidth, Math.floor(minX)));
    const right = Math.max(0, Math.min(targetWidth, Math.ceil(maxX)));
    const y = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
    const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
    const width = Math.max(0, right - x);
    const height = Math.max(0, bottom - y);

    return { x, y, width, height };
  }

  private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState): PixelClipBoundsState {
    const left = Math.max(first.x, second.x);
    const top = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const bottom = Math.min(first.y + first.height, second.y + second.height);

    return {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  private _createSampler(texture: Texture | RenderTexture): GPUSampler {
    // Float32 textures (r32float, rgba32float) are non-filterable by default
    // in WebGPU; force nearest filtering to avoid validation errors. Apps
    // that need linear filtering on floats can opt into the
    // 'float32-filterable' device feature and pass linear via samplerOptions
    // (not yet exposed).
    const isFloatData = texture instanceof DataTexture && (texture.format === 'r32f' || texture.format === 'rgba32f');
    const filter: GPUFilterMode = isFloatData ? 'nearest' : this._getFilterMode(texture.scaleMode);

    return this.device.createSampler({
      addressModeU: this._getAddressMode(texture.wrapMode),
      addressModeV: this._getAddressMode(texture.wrapMode),
      magFilter: filter,
      minFilter: filter,
      mipmapFilter: isFloatData ? 'nearest' : this._getMipmapFilterMode(texture.scaleMode),
    });
  }

  private _getGpuTextureFormat(texture: Texture | RenderTexture): GPUTextureFormat {
    if (texture instanceof DataTexture) {
      return webgpuDataTextureFormat(texture.format).gpuFormat;
    }
    return managedTextureFormat;
  }

  private _getTextureUsage(texture: Texture | RenderTexture): number {
    const mipmapUsage = this._getMipLevelCount(texture) > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0;

    if (texture instanceof RenderTexture) {
      return GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | mipmapUsage;
    }

    return GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | mipmapUsage;
  }

  private _getAddressMode(wrapMode: WrapModes): GPUAddressMode {
    switch (wrapMode) {
      case WrapModes.Repeat:
        return 'repeat';
      case WrapModes.MirroredRepeat:
        return 'mirror-repeat';
      default:
        return 'clamp-to-edge';
    }
  }

  private _getFilterMode(scaleMode: ScaleModes): GPUFilterMode {
    switch (scaleMode) {
      case ScaleModes.Nearest:
      case ScaleModes.NearestMipmapNearest:
      case ScaleModes.NearestMipmapLinear:
        return 'nearest';
      default:
        return 'linear';
    }
  }

  private _getMipmapFilterMode(scaleMode: ScaleModes): GPUMipmapFilterMode {
    switch (scaleMode) {
      case ScaleModes.NearestMipmapLinear:
      case ScaleModes.LinearMipmapLinear:
        return 'linear';
      default:
        return 'nearest';
    }
  }

  private _getMipLevelCount(texture: Texture | RenderTexture): number {
    if (!texture.generateMipMap) {
      return 1;
    }

    const maxSize = Math.max(texture.width, texture.height);

    if (maxSize <= 1) {
      return 1;
    }

    return Math.floor(Math.log2(maxSize)) + 1;
  }

  private _generateMipmaps(texture: GPUTexture, mipLevelCount: number): void {
    if (mipLevelCount <= 1) {
      return;
    }

    const resources = this._getMipmapResources();
    const encoder = this.device.createCommandEncoder();

    for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
      const bindGroup = this.device.createBindGroup({
        layout: resources.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: texture.createView({
              baseMipLevel: mipLevel - 1,
              mipLevelCount: 1,
            }),
          },
          {
            binding: 1,
            resource: resources.sampler,
          },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView({
              baseMipLevel: mipLevel,
              mipLevelCount: 1,
            }),
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

    this.device.queue.submit([encoder.finish()]);
  }

  private _getMipmapResources(): {
    readonly bindGroupLayout: GPUBindGroupLayout;
    readonly pipeline: GPURenderPipeline;
    readonly sampler: GPUSampler;
  } {
    if (
      this._mipmapShaderModule === null ||
      this._mipmapBindGroupLayout === null ||
      this._mipmapPipelineLayout === null ||
      this._mipmapPipeline === null ||
      this._mipmapSampler === null
    ) {
      this._mipmapShaderModule = this.device.createShaderModule({
        code: `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@group(0) @binding(0)
var sourceTexture: texture_2d<f32>;
@group(0) @binding(1)
var sourceSampler: sampler;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    // Y is flipped vs the position array: NDC Y points up, but texture UV
    // Y points down (UV (0,0) is the top-left of the source). Matching the
    // two ensures that the output texture's top-left pixel samples from the
    // source's top-left, so every mip level has the same orientation as the
    // level above it. Prior to this, odd mip levels were rendered upside
    // down, producing visible texture flips at view-size doublings.
    var texcoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );
    var output: VertexOutput;

    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texcoord = texcoords[vertexIndex];

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(sourceTexture, sourceSampler, input.texcoord);
}
`,
      });
      this._mipmapBindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {
              sampleType: 'float',
            },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {
              type: 'filtering',
            },
          },
        ],
      });
      this._mipmapPipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: [this._mipmapBindGroupLayout],
      });
      this._mipmapPipeline = this.device.createRenderPipeline({
        layout: this._mipmapPipelineLayout,
        vertex: {
          module: this._mipmapShaderModule,
          entryPoint: 'vertexMain',
        },
        fragment: {
          module: this._mipmapShaderModule,
          entryPoint: 'fragmentMain',
          targets: [
            {
              format: managedTextureFormat,
              writeMask: GPUColorWrite.ALL,
            },
          ],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });
      this._mipmapSampler = this.device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'nearest',
      });
    }

    return {
      bindGroupLayout: this._mipmapBindGroupLayout,
      pipeline: this._mipmapPipeline,
      sampler: this._mipmapSampler,
    };
  }
}

interface WebGpuDataTextureFormatInfo {
  readonly gpuFormat: GPUTextureFormat;
  readonly bytesPerPixel: number;
  readonly channels: number;
}

function webgpuDataTextureFormat(format: DataTextureFormat): WebGpuDataTextureFormatInfo {
  switch (format) {
    case 'r8':
      return { gpuFormat: 'r8unorm', bytesPerPixel: 1, channels: 1 };
    case 'r32f':
      return { gpuFormat: 'r32float', bytesPerPixel: 4, channels: 1 };
    case 'rgba8':
      return { gpuFormat: 'rgba8unorm', bytesPerPixel: 4, channels: 4 };
    case 'rgba32f':
      return { gpuFormat: 'rgba32float', bytesPerPixel: 16, channels: 4 };
  }
}
