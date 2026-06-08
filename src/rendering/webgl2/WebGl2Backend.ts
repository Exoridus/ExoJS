import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';
import { Vector } from '#math/Vector';
import type { BackendRenderPass } from '#rendering/BackendRenderPass';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import { type DrawCommand, drawCommandUsesSharedTransform } from '#rendering/plan/RenderCommand';
import type { RenderGroup } from '#rendering/plan/RenderInstruction';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import type { Renderer } from '#rendering/Renderer';
import { RendererRegistry } from '#rendering/RendererRegistry';
import type { RenderStats } from '#rendering/RenderStats';
import { createRenderStats, resetRenderStats } from '#rendering/RenderStats';
import { RenderTarget } from '#rendering/RenderTarget';
import type { Shader } from '#rendering/shader/Shader';
import { DataTexture, type DataTextureFormat } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { TransformBuffer } from '#rendering/TransformBuffer';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { WebGl2MaskCompositor } from './WebGl2MaskCompositor';
import { WebGl2PassCoordinator } from './WebGl2PassCoordinator';
import { WebGl2StencilClipper } from './WebGl2StencilClipper';
import type { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';

// Inline GL debug helpers — replaces the webgl-debug vendor lib.
// Used only when renderingOptions.debug = true.
const glEnumToString = (gl: WebGL2RenderingContext, value: number): string => {
  const ctor = gl.constructor as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(ctor)) {
    if (ctor[key] === value) return key;
  }
  return `0x${value.toString(16).padStart(4, '0').toUpperCase()}`;
};

const glArgsToString = (gl: WebGL2RenderingContext, args: unknown[]): string =>
  args.map(a => (typeof a === 'number' ? glEnumToString(gl, a) : String(a))).join(', ');

const makeWebGl2DebugContext = (gl: WebGL2RenderingContext): WebGL2RenderingContext =>
  new Proxy(gl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const name = String(prop);
      return (...args: unknown[]) => {
        console.log(`gl.${name}(${glArgsToString(target, args)})`);
        for (const arg of args) {
          if (arg === undefined) {
            console.error(`undefined passed to gl.${name}(${glArgsToString(target, args)})`);
          }
        }
        const result = Reflect.apply(value as (...a: unknown[]) => unknown, target, args);
        if (name !== 'getError') {
          const err = target.getError();
          if (err !== target.NO_ERROR) {
            throw new Error(`${glEnumToString(target, err)} was caused by call to: ${name}`);
          }
        }
        return result;
      };
    },
  });

interface ManagedTextureState {
  readonly handle: WebGLTexture;
  version: number;
  width: number;
  height: number;
}

interface ManagedRenderTargetState {
  framebuffer: WebGLFramebuffer | null;
  version: number;
  attachedTexture: WebGLTexture | null;
  stencilRenderbuffer: WebGLRenderbuffer | null;
  stencilWidth: number;
  stencilHeight: number;
}

interface StencilClipEntry {
  readonly shape: Geometry;
  readonly transform: Matrix;
}

// Stencil clipping is per-target: each framebuffer owns its stencil buffer, so
// a clip established on one target must not affect rendering into another
// (e.g. an alpha-mask capture nested inside a stencil clip). State is keyed by
// the target it was pushed on and re-applied on every target switch.
interface StencilTargetState {
  depth: number;
  stack: StencilClipEntry[];
}

interface PixelClipBoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DestroyListenable {
  addDestroyListener(listener: () => void): unknown;
  removeDestroyListener(listener: () => void): unknown;
}

const renderTargetTextureSyncUnit = 15;

/**
 * WebGL 2.0 implementation of {@link RenderBackend}. Manages the GL
 * context, texture and framebuffer caches keyed by user-side
 * {@link Texture}/{@link RenderTexture} identity, the active VAO, shader
 * program, blend mode, and scissor stack. Dispatches to per-drawable
 * renderers ({@link WebGl2SpriteRenderer}, {@link WebGl2MeshRenderer},
 * {@link WebGl2ParticleRenderer}) registered in the {@link RendererRegistry}.
 *
 * Emits {@link WebGl2Backend.onContextLost} / {@link WebGl2Backend.onContextRestored}
 * Signals when the browser loses or regains the GL context. The browser
 * recreates the context automatically; renderers reconnect their
 * GPU-side state as needed on the next draw.
 */
export class WebGl2Backend implements RenderBackend {
  public readonly backendType = RenderBackendType.WebGl2;
  public readonly rendererRegistry: RendererRegistry<WebGl2Backend> = new RendererRegistry<WebGl2Backend>();
  public readonly onContextLost = new Signal();
  public readonly onContextRestored = new Signal();

  private readonly _context: WebGL2RenderingContext;
  private readonly _rootRenderTarget: RenderTarget;
  private readonly _onContextLostHandler: () => void;
  private readonly _onContextRestoredHandler: () => void;
  private readonly _textureStates: Map<Texture | RenderTexture, ManagedTextureState> = new Map<Texture | RenderTexture, ManagedTextureState>();
  private readonly _renderTargetStates: Map<RenderTarget, ManagedRenderTargetState> = new Map<RenderTarget, ManagedRenderTargetState>();
  private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
  private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
  private readonly _temporaryRenderTextures: RenderTexture[] = [];
  private readonly _clipBoundsStack: Rectangle[] = [];
  private readonly _clipPixelStack: PixelClipBoundsState[] = [];
  private readonly _clipPointA: Vector = new Vector();
  private readonly _clipPointB: Vector = new Vector();
  private readonly _maskCompositor: WebGl2MaskCompositor = new WebGl2MaskCompositor();
  private _maskCompositorConnected = false;
  private readonly _stencilClipper: WebGl2StencilClipper = new WebGl2StencilClipper();
  private readonly _stencilStates: Map<RenderTarget, StencilTargetState> = new Map<RenderTarget, StencilTargetState>();
  private _stencilClipperConnected = false;
  private _passCoordinatorInstance: WebGl2PassCoordinator | null = null;

  private _canvas: HTMLCanvasElement;
  private _contextLost: boolean;
  private _renderTarget: RenderTarget;
  private _renderer: Renderer | null = null;
  private _shader: Shader | null = null;
  private _blendMode: BlendModes | null = null;
  private _texture: Texture | RenderTexture | null = null;
  private _textureUnit = 0;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _clearColor: Color = new Color();
  private _boundFramebuffer: WebGLFramebuffer | null = null;
  private readonly _stats: RenderStats = createRenderStats();
  private readonly _transformBuffer = new TransformBuffer();
  private _transformTexture: DataTexture<'rgba32f'> | null = null;
  private _transformTextureHash = 0;
  private _transformTextureCount = -1;
  private _activeDrawCommand: DrawCommand | null = null;
  private _drawPlanDepth = 0;

  public constructor(app: Application) {
    const canvasOptions = app.options.canvas ?? {};
    const renderingOptions = app.options.rendering ?? {};
    const width = canvasOptions.width ?? 800;
    const height = canvasOptions.height ?? 600;
    const clearColor = app.options.clearColor;
    const webglAttributes = renderingOptions.webglAttributes;
    const debug = renderingOptions.debug ?? false;
    this._canvas = app.canvas;

    const gl = this._createContext(webglAttributes);

    if (!gl) {
      throw new Error('This browser or hardware does not support WebGL.');
    }

    this._context = debug ? makeWebGl2DebugContext(gl) : gl;
    this._contextLost = this._context.isContextLost();

    if (this._contextLost) {
      this._restoreContext();
    }

    if (clearColor) {
      this.clearColor.copy(clearColor);
    }

    this._rootRenderTarget = new RenderTarget(width, height, true);
    this._renderTarget = this._rootRenderTarget;

    this._onContextLostHandler = this._onContextLost.bind(this);
    this._onContextRestoredHandler = this._onContextRestored.bind(this);

    this._setupContext();
    this._addEvents();

    // Core renderers are bound via buildCoreRendererBindings in Application.createBackend.
    // Connect the registry now so newly bound renderers are immediately connected.
    this.rendererRegistry.connect(this);

    this._bindRenderTarget(this._renderTarget);
    this.setBlendMode(BlendModes.Normal);

    this.resize(width, height);
  }

  public get context(): WebGL2RenderingContext {
    return this._context;
  }

  public get renderTarget(): RenderTarget {
    return this._renderTarget;
  }

  public get view(): View {
    return this._renderTarget.view;
  }

  public get clearColor(): Color {
    return this._clearColor;
  }

  public get stats(): RenderStats {
    return this._stats;
  }

  /** @internal */
  public get activeDrawCommand(): DrawCommand | null {
    return this._activeDrawCommand;
  }

  /**
   * Internal render-pass coordinator. Owns target / view / clear orchestration
   * and the scissor / stencil-clip stacks for this backend; not part of the
   * public {@link RenderBackend} surface.
   * @internal
   */
  public get _passCoordinator(): WebGl2PassCoordinator {
    return (this._passCoordinatorInstance ??= new WebGl2PassCoordinator(this));
  }

  public async initialize(): Promise<this> {
    return this;
  }

  public resetStats(): this {
    resetRenderStats(this._stats);

    return this;
  }

  /** @internal */
  public _beginDrawPlan(nodeCount: number): void {
    this._transformBuffer.begin(nodeCount);
    this._activeDrawCommand = null;
    this._drawPlanDepth++;
  }

  /** @internal */
  public _prepareRenderGroupUpload(group: RenderGroup): void {
    // Pack the whole render group's world transforms (+ tint) into the shared
    // transform buffer at the group's upload boundary, keyed by each draw
    // command's stable nodeIndex. Every draw the player will submit for this
    // group is covered here, before the group's first draw — so the per-draw
    // write previously done in `_prepareDrawCommand` is no longer needed and
    // the buffer is filled one contiguous group slice at a time.
    //
    // Renderers that pack their own per-node data (Text, Particle) never read
    // the shared buffer, so their commands are skipped — no consuming draw ever
    // references their slots (nodeIndex is unique per command).
    const instructions = group.instructions;

    for (let i = 0; i < instructions.length; i++) {
      const command = instructions[i];

      if (drawCommandUsesSharedTransform(command, this)) {
        this._writeTransformCommand(command);
      } else {
        this._transformBuffer.recordSkippedWrite();
      }
    }
  }

  /** @internal */
  public _prepareDrawCommand(command: DrawCommand): void {
    // Transform packing now happens at the render-group upload boundary
    // (`_prepareRenderGroupUpload`); this hook only tracks the active draw so
    // the mesh renderer can read the current command's nodeIndex.
    this._activeDrawCommand = command;
  }

  /**
   * Write a single draw command's world transform (+ tint) into the shared
   * transform buffer at its `nodeIndex` slot. Used for draws that do not arrive
   * through a render-group upload boundary — currently the mesh renderer's
   * synthetic, non-plan instanced path.
   * @internal
   */
  public _writeTransformCommand(command: DrawCommand): void {
    const drawable = command.drawable;

    this._transformBuffer.write(command.nodeIndex, drawable.getGlobalTransform(), drawable.tint);
  }

  /**
   * Append a drawable's world transform (+ tint) to the shared transform buffer
   * and return the slot it was written to. Used by instanced renderers for draws
   * that arrive without a render-group upload boundary — i.e. a direct
   * `backend.draw(drawable)` outside the plan player (`activeDrawCommand === null`),
   * where no stable `nodeIndex` was assigned. Unlike {@link _writeTransformCommand}
   * (fixed slot) this allocates a fresh slot, so a batch of synthetic draws does
   * not collide on a single row.
   * @internal
   */
  public _pushTransform(drawable: Drawable): number {
    return this._transformBuffer.push(drawable.getGlobalTransform(), drawable.tint);
  }

  /** @internal */
  public _endDrawPlan(): void {
    this._activeDrawCommand = null;

    if (this._drawPlanDepth > 0) {
      this._drawPlanDepth--;
    }

    // Only assert balance at the outermost plan: cacheAsBitmap draws a cache
    // sprite via a nested render(), whose inner _endDrawPlan sees the still-open
    // outer clips — those are not leaks.
    if (this._drawPlanDepth === 0) {
      this._assertBalancedStencil();
    }
  }

  private _assertBalancedStencil(): void {
    let unpopped = 0;

    for (const state of this._stencilStates.values()) {
      unpopped += state.stack.length;
    }

    if (unpopped === 0) {
      return;
    }

    // Reset so a leaked clip cannot corrupt subsequent frames, then surface it.
    for (const state of this._stencilStates.values()) {
      state.depth = 0;
      state.stack.length = 0;
    }

    const gl = this._context;

    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.disable(gl.STENCIL_TEST);

    throw new Error(`Unbalanced stencil clip stack at end of frame (${unpopped} unpopped clip(s)).`);
  }

  public draw(drawable: Drawable): this {
    const renderer = this.rendererRegistry.resolve(drawable);

    this._setActiveRenderer(renderer);
    renderer.render(drawable);
    this._activeDrawCommand = null;
    this._stats.submittedNodes++;

    return this;
  }

  public execute(pass: BackendRenderPass): this {
    this._flushActiveRenderer();
    this._stats.renderPasses++;
    pass.execute(this);

    return this;
  }

  public setRenderTarget(target: RenderTarget | null): this {
    const renderTarget = target || this._rootRenderTarget;
    const changed = this._renderTarget !== renderTarget;

    if (changed) {
      this._flushActiveRenderer();
      this._renderTarget = renderTarget;
      this._stats.renderTargetChanges++;
    }

    this._bindRenderTarget(renderTarget);

    if (changed) {
      // Stencil state is per-target: restore the new target's clip depth so an
      // outer clip on the previous target does not leak onto this one.
      this._applyStencilState(renderTarget);
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
    this._applyClipState();

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
    this._applyClipState();

    return this;
  }

  public pushStencilClip(shape: Geometry, transform: Matrix): this {
    const target = this._renderTarget;
    const state = this._getStencilState(target);

    if (state.depth >= 255) {
      throw new Error('Stencil clip nesting exceeds the 255-level limit.');
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._stencilClipperConnected) {
      this._stencilClipper.connect(this);
      this._stencilClipperConnected = true;
    }

    const gl = this._context;
    const depth = state.depth;

    if (depth === 0) {
      this._ensureTargetStencil();
      gl.enable(gl.STENCIL_TEST);

      // Clear the whole stencil buffer to 0 regardless of any active scissor,
      // then restore the scissor state for the shape/content draws.
      gl.disable(gl.SCISSOR_TEST);
      gl.clearStencil(0);
      gl.clear(gl.STENCIL_BUFFER_BIT);
      this._applyClipState();
    }

    // Increment the stencil where the shape covers the already-valid region
    // (EQUAL depth). Color/depth writes off so only the stencil is touched.
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);

    this._stencilClipper.draw(this, shape, transform);

    gl.colorMask(true, true, true, true);

    state.depth = depth + 1;
    state.stack.push({ shape, transform: new Matrix().copy(transform) });

    // Content now passes only where the stencil equals the new depth.
    gl.stencilFunc(gl.EQUAL, state.depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    return this;
  }

  public popStencilClip(): this {
    const target = this._renderTarget;
    const state = this._getStencilState(target);
    const entry = state.stack.pop();

    if (entry === undefined) {
      return this;
    }

    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    const gl = this._context;
    const depth = state.depth;

    // Decrement the region this clip incremented, restoring the outer level.
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);

    this._stencilClipper.draw(this, entry.shape, entry.transform);

    gl.colorMask(true, true, true, true);

    state.depth = depth - 1;
    this._applyStencilState(target);

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

    // Flush any in-progress drawable batch so the compositor draws on
    // top of fully-committed render state, not in the middle of a batch.
    this._flushActiveRenderer();
    this._setActiveRenderer(null);

    if (!this._maskCompositorConnected) {
      this._maskCompositor.connect(this);
      this._maskCompositorConnected = true;
    }

    this._maskCompositor.compose(this, content, mask, x, y, width, height, blendMode);

    return this;
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
    this._bindRenderTarget(this._renderTarget);

    return this;
  }

  public bindVertexArrayObject(vao: WebGl2VertexArrayObject | null): this {
    if (this._vao !== vao) {
      if (vao) {
        // Binding a VAO implicitly replaces the previous binding. Only when
        // switching to "no VAO" do we explicitly unbind — unbinding the old VAO
        // *after* binding the new one would leave the GL default (null) VAO
        // bound and silently break the next draw (a renderer/clip VAO switch).
        vao.bind();
      } else {
        this._vao?.unbind();
      }

      this._vao = vao;
    }

    return this;
  }

  public bindShader(shader: Shader | null): this {
    if (this._shader !== shader) {
      if (this._shader) {
        this._shader.unbind();
        this._shader = null;
      }

      if (shader) {
        shader.bind();
      }

      this._shader = shader;
    }

    return this;
  }

  public bindTexture(texture: Texture | RenderTexture | null, unit?: number): this {
    if (unit !== undefined) {
      this._setTextureUnit(unit);
    }

    if (texture === null) {
      if (this._texture !== null) {
        this._context.bindTexture(this._context.TEXTURE_2D, null);
        this._texture = null;
      }

      return this;
    }

    const textureState = this._syncTexture(texture);

    this._context.bindTexture(this._context.TEXTURE_2D, textureState.handle);
    this._texture = texture;

    return this;
  }

  /** @internal */
  public bindTransformBufferTexture(unit: number, minCount: number): this {
    const requiredCount = Math.max(1, minCount);
    const transformTexture = this._transformTexture;

    if (transformTexture?.height !== this._transformBuffer.capacity || transformTexture.buffer !== this._transformBuffer.data) {
      transformTexture?.destroy();

      this._transformTexture = new DataTexture({
        width: 3,
        height: this._transformBuffer.capacity,
        format: 'rgba32f',
        data: this._transformBuffer.data,
      });
      this._transformTextureHash = 0;
      this._transformTextureCount = -1;
    }

    const snapshot = this._transformBuffer.commitSnapshot(requiredCount);
    const nextTransformTexture = this._transformTexture;

    if (nextTransformTexture === null) {
      throw new Error('Transform texture must be initialized before binding.');
    }

    if (snapshot.changed || snapshot.count !== this._transformTextureCount || snapshot.hash !== this._transformTextureHash) {
      nextTransformTexture.commitRect(0, 0, 3, snapshot.count);
      this._transformBuffer.recordUpload(snapshot.count);
      this._transformTextureHash = snapshot.hash;
      this._transformTextureCount = snapshot.count;
    }

    return this.bindTexture(nextTransformTexture, unit);
  }

  public setBlendMode(blendMode: BlendModes | null): this {
    if (blendMode !== this._blendMode) {
      const gl = this._context;

      this._blendMode = blendMode;

      switch (blendMode) {
        case BlendModes.Additive:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE);
          break;
        case BlendModes.Subtract:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
          break;
        case BlendModes.Multiply:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
          break;
        case BlendModes.Screen:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
          break;
        case BlendModes.Darken:
          gl.blendEquation(gl.MIN);
          gl.blendFunc(gl.ONE, gl.ONE);
          break;
        case BlendModes.Lighten:
          gl.blendEquation(gl.MAX);
          gl.blendFunc(gl.ONE, gl.ONE);
          break;
        default:
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          break;
      }
    }

    return this;
  }

  private _setTextureUnit(unit: number): void {
    if (this._textureUnit !== unit) {
      const gl = this._context;

      this._textureUnit = unit;

      gl.activeTexture(gl.TEXTURE0 + unit);
    }
  }

  public setClearColor(color: Color): this {
    if (!this._clearColor.equals(color)) {
      const gl = this._context;

      this._clearColor.copy(color);

      gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
    }

    return this;
  }

  public clear(color?: Color): this {
    const gl = this._context;

    if (color) {
      this.setClearColor(color);
    }

    this._bindRenderTarget(this._renderTarget);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return this;
  }

  public resize(width: number, height: number): this {
    this._rootRenderTarget.resize(width, height);
    this._bindRenderTarget(this._renderTarget);

    return this;
  }

  public flush(): this {
    this._flushActiveRenderer();

    return this;
  }

  public destroy(): void {
    this._removeEvents();
    this.onContextLost.destroy();
    this.onContextRestored.destroy();

    this.setRenderTarget(null);
    this._setActiveRenderer(null);
    this.bindVertexArrayObject(null);
    this.bindShader(null);
    this.bindTexture(null);

    this.rendererRegistry.destroy();
    this._clearColor.destroy();
    this._destroyManagedResources();
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

    if (this._stencilClipperConnected) {
      this._stencilClipper.disconnect();
      this._stencilClipperConnected = false;
    }

    this._stencilStates.clear();
    this._drawPlanDepth = 0;
    this._rootRenderTarget.destroy();

    if (this._transformTexture !== null) {
      this._transformTexture.destroy();
      this._transformTexture = null;
    }

    this._vao = null;
    this._renderer = null;
    this._shader = null;
    this._blendMode = null;
    this._texture = null;
    this._boundFramebuffer = null;
    this._activeDrawCommand = null;
    this._transformTextureCount = -1;
    this._transformTextureHash = 0;
  }

  private _createContext(options?: WebGLContextAttributes): WebGL2RenderingContext | null {
    try {
      // Force a stencil buffer on the default framebuffer so geometric stencil
      // clipping (RenderNode.clip with a Geometry clipShape) works on the root
      // target. Inert until a clip is pushed (STENCIL_TEST stays disabled).
      return this._canvas.getContext('webgl2', { ...options, stencil: true });
    } catch (_e) {
      return null;
    }
  }

  private _restoreContext(): void {
    this._context.getExtension('WEBGL_lose_context')?.restoreContext();
  }

  private _setupContext(): void {
    const gl = this._context;
    const { r, g, b, a } = this._clearColor;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);

    gl.enable(gl.BLEND);

    gl.blendEquation(gl.FUNC_ADD);
    gl.clearColor(r / 255, g / 255, b / 255, a);
  }

  private _addEvents(): void {
    this._canvas.addEventListener('webglcontextlost', this._onContextLostHandler, false);
    this._canvas.addEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
  }

  private _removeEvents(): void {
    this._canvas.removeEventListener('webglcontextlost', this._onContextLostHandler, false);
    this._canvas.removeEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
  }

  private _onContextLost(): void {
    this._contextLost = true;
    this.onContextLost.dispatch();
    this._restoreContext();
  }

  private _onContextRestored(): void {
    this._contextLost = false;
    this.onContextRestored.dispatch();
  }

  private _createFramebuffer(): WebGLFramebuffer {
    const framebuffer = this._context.createFramebuffer();

    if (framebuffer === null) {
      throw new Error('Could not create framebuffer.');
    }

    return framebuffer;
  }

  private _createTextureHandle(): WebGLTexture {
    const texture = this._context.createTexture();

    if (texture === null) {
      throw new Error('Could not create texture.');
    }

    return texture;
  }

  private _destroyManagedResources(): void {
    for (const renderTarget of [...this._renderTargetStates.keys()]) {
      this._evictRenderTarget(renderTarget, false);
    }

    for (const texture of [...this._textureStates.keys()]) {
      this._evictTexture(texture, false);
    }
  }

  private _destroyTemporaryRenderTextures(): void {
    for (const texture of this._temporaryRenderTextures) {
      texture.destroy();
    }

    this._temporaryRenderTextures.length = 0;
  }

  private _getRenderTargetState(target: RenderTarget): ManagedRenderTargetState {
    let state = this._renderTargetStates.get(target);

    if (!state) {
      this._subscribeToDestroy(target, this._renderTargetDestroyHandlers, () => {
        this._evictRenderTarget(target, true);
      });

      state = {
        framebuffer: target.root ? null : this._createFramebuffer(),
        version: -1,
        attachedTexture: null,
        stencilRenderbuffer: null,
        stencilWidth: 0,
        stencilHeight: 0,
      };

      this._renderTargetStates.set(target, state);
    }

    return state;
  }

  private _getTextureState(texture: Texture | RenderTexture): ManagedTextureState {
    let state = this._textureStates.get(texture);

    if (!state) {
      this._subscribeToDestroy(texture, this._textureDestroyHandlers, () => {
        this._evictTexture(texture, true);
      });

      state = {
        handle: this._createTextureHandle(),
        version: -1,
        width: 0,
        height: 0,
      };

      this._textureStates.set(texture, state);
    }

    return state;
  }

  private _subscribeToDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
    if (!handlers.has(descriptor)) {
      descriptor.addDestroyListener(handler);
      handlers.set(descriptor, handler);
    }
  }

  private _unsubscribeFromDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>): void {
    const handler = handlers.get(descriptor);

    if (handler) {
      descriptor.removeDestroyListener(handler);
      handlers.delete(descriptor);
    }
  }

  private _evictRenderTarget(target: RenderTarget, rebind: boolean): void {
    const state = this._renderTargetStates.get(target);

    this._unsubscribeFromDestroy(target, this._renderTargetDestroyHandlers);

    if (target instanceof RenderTexture) {
      this._evictTexture(target, false);
    }

    if (state) {
      if (this._boundFramebuffer === state.framebuffer) {
        this._context.bindFramebuffer(this._context.FRAMEBUFFER, null);
        this._boundFramebuffer = null;
      }

      if (state.framebuffer !== null) {
        this._context.deleteFramebuffer(state.framebuffer);
      }

      if (state.stencilRenderbuffer !== null) {
        this._context.deleteRenderbuffer(state.stencilRenderbuffer);
        state.stencilRenderbuffer = null;
      }

      this._renderTargetStates.delete(target);
    }

    this._stencilStates.delete(target);

    if (this._renderTarget === target) {
      this._renderTarget = this._rootRenderTarget;

      if (rebind) {
        this._bindRenderTarget(this._rootRenderTarget);
      }
    }
  }

  private _evictTexture(texture: Texture | RenderTexture, rebind: boolean): void {
    const state = this._textureStates.get(texture);

    this._unsubscribeFromDestroy(texture, this._textureDestroyHandlers);

    if (state) {
      if (this._texture === texture) {
        this._context.bindTexture(this._context.TEXTURE_2D, null);
        this._texture = null;
      }

      this._context.deleteTexture(state.handle);
      this._textureStates.delete(texture);
    }

    if (this._texture === texture) {
      this._texture = null;
    }

    if (rebind && this._texture !== null) {
      this.bindTexture(this._texture);
    }
  }

  private _bindRenderTarget(target: RenderTarget): void {
    const state = this._prepareRenderTarget(target);

    if (this._boundFramebuffer !== state.framebuffer || state.version !== target.version) {
      const gl = this._context;
      const viewport = target.getViewport();
      const scaleX = target.root && target.width > 0 ? this._canvas.width / target.width : 1;
      const scaleY = target.root && target.height > 0 ? this._canvas.height / target.height : 1;
      const x = Math.floor(viewport.x * scaleX);
      const y = Math.floor(viewport.y * scaleY);
      const width = Math.max(0, Math.round(viewport.width * scaleX));
      const height = Math.max(0, Math.round(viewport.height * scaleY));

      gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
      gl.viewport(x, y, width, height);

      this._boundFramebuffer = state.framebuffer;
      state.version = target.version;
    }

    if (this._clipPixelStack.length > 0) {
      this._applyClipState();
    }
  }

  private _setActiveRenderer(renderer: Renderer | null): void {
    if (this._renderer !== renderer) {
      this._flushActiveRenderer();
      this._renderer = renderer;
    }
  }

  private _flushActiveRenderer(): void {
    if (this._renderer && !this._contextLost) {
      this._bindRenderTarget(this._renderTarget);
      this._renderer.flush();
    }
  }

  private _prepareRenderTarget(target: RenderTarget): ManagedRenderTargetState {
    const state = this._getRenderTargetState(target);

    if (target instanceof RenderTexture && state.framebuffer) {
      const previousFramebuffer = this._boundFramebuffer;

      const previousUnit = this._textureUnit;

      this._setTextureUnit(renderTargetTextureSyncUnit);
      const textureState = this._syncTexture(target);
      this._setTextureUnit(previousUnit);

      if (state.attachedTexture !== textureState.handle) {
        const gl = this._context;

        gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureState.handle, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);

        state.attachedTexture = textureState.handle;
      }

      // Reset the on-demand flag for pooled RenderTexture targets, so a
      // stencil renderbuffer from a previous use does not permanently
      // consume GPU memory when the target is re-purposed for non-clip
      // rendering.
      if (!this._stencilStates.has(target)) {
        target.needsStencil = false;
      }

      // Keep an existing stencil attachment sized to the (possibly resized)
      // texture so the framebuffer stays complete during non-clip rendering.
      if (target.needsStencil || state.stencilRenderbuffer !== null) {
        this._syncStencilAttachment(target, state);
      }
    }

    return state;
  }

  /** Attach a depth/stencil renderbuffer to the active target if it lacks one. */
  private _ensureTargetStencil(): void {
    const target = this._renderTarget;

    if (target.root) {
      // The default framebuffer's stencil comes from the context attributes.
      return;
    }

    target.needsStencil = true;
    this._syncStencilAttachment(target, this._getRenderTargetState(target));
  }

  private _syncStencilAttachment(target: RenderTarget, state: ManagedRenderTargetState): void {
    if (state.framebuffer === null) {
      return;
    }

    const gl = this._context;
    const width = Math.max(1, target.width);
    const height = Math.max(1, target.height);

    if (state.stencilRenderbuffer !== null && state.stencilWidth === width && state.stencilHeight === height) {
      return;
    }

    if (state.stencilRenderbuffer === null) {
      state.stencilRenderbuffer = gl.createRenderbuffer();
    }

    gl.bindRenderbuffer(gl.RENDERBUFFER, state.stencilRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    const previousFramebuffer = this._boundFramebuffer;

    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, state.stencilRenderbuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);

    state.stencilWidth = width;
    state.stencilHeight = height;
  }

  private _getStencilState(target: RenderTarget): StencilTargetState {
    let state = this._stencilStates.get(target);

    if (state === undefined) {
      state = { depth: 0, stack: [] };
      this._stencilStates.set(target, state);
    }

    return state;
  }

  /** Re-apply the GL stencil test to match `target`'s current clip depth. */
  private _applyStencilState(target: RenderTarget): void {
    const gl = this._context;
    const depth = this._getStencilState(target).depth;

    if (depth === 0) {
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.disable(gl.STENCIL_TEST);

      return;
    }

    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, depth, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }

  private _syncTexture(texture: Texture | RenderTexture): ManagedTextureState {
    const gl = this._context;
    const state = this._getTextureState(texture);
    const version = texture instanceof RenderTexture ? texture.textureVersion : texture.version;

    gl.bindTexture(gl.TEXTURE_2D, state.handle);

    if (state.version !== version) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texture.scaleMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.scaleMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, texture.wrapMode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, texture.wrapMode);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);

      if (texture instanceof DataTexture) {
        const formatInfo = webgl2DataTextureFormat(texture.format);
        const region = texture._consumeDirtyRegion();
        const needsAlloc = state.version === -1 || state.width !== texture.width || state.height !== texture.height;

        if (needsAlloc || region === null || region.full) {
          gl.texImage2D(gl.TEXTURE_2D, 0, formatInfo.internalFormat, texture.width, texture.height, 0, formatInfo.format, formatInfo.type, texture.buffer);
        } else {
          // Partial upload: pack a contiguous sub-region from the row-major
          // buffer into a temporary view that gl.texSubImage2D can read.
          const channels = formatInfo.channels;
          const rowFloats = texture.width * channels;
          const subFloats = region.width * channels;
          const subView =
            texture.buffer instanceof Float32Array
              ? new Float32Array(region.width * region.height * channels)
              : new Uint8Array(region.width * region.height * channels);

          for (let row = 0; row < region.height; row++) {
            const sourceStart = (region.y + row) * rowFloats + region.x * channels;
            const targetStart = row * subFloats;
            subView.set(texture.buffer.subarray(sourceStart, sourceStart + subFloats), targetStart);
          }

          gl.texSubImage2D(gl.TEXTURE_2D, 0, region.x, region.y, region.width, region.height, formatInfo.format, formatInfo.type, subView);
        }
      } else if (texture instanceof RenderTexture) {
        if (state.version === -1 || state.width !== texture.width || state.height !== texture.height || texture.source === null) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        }
      } else if (texture.source) {
        if (state.version === -1 || state.width !== texture.width || state.height !== texture.height) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        } else {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
        }
      }

      if (texture.generateMipMap && (texture instanceof RenderTexture || texture.source !== null)) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }

      state.version = version;
      state.width = texture.width;
      state.height = texture.height;
    }

    return state;
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
    const yTop = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
    const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
    const width = Math.max(0, right - x);
    const height = Math.max(0, bottom - yTop);
    const y = Math.max(0, targetHeight - bottom);

    return {
      x,
      y,
      width,
      height,
    };
  }

  private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState): PixelClipBoundsState {
    const left = Math.max(first.x, second.x);
    const bottom = Math.max(first.y, second.y);
    const right = Math.min(first.x + first.width, second.x + second.width);
    const top = Math.min(first.y + first.height, second.y + second.height);

    return {
      x: left,
      y: bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, top - bottom),
    };
  }

  private _applyClipState(): void {
    const gl = this._context;

    if (this._clipPixelStack.length === 0) {
      gl.disable(gl.SCISSOR_TEST);

      return;
    }

    const clip = this._clipPixelStack[this._clipPixelStack.length - 1];
    const scaleX = this._renderTarget.root && this._renderTarget.width > 0 ? this._canvas.width / this._renderTarget.width : 1;
    const scaleY = this._renderTarget.root && this._renderTarget.height > 0 ? this._canvas.height / this._renderTarget.height : 1;
    const x = Math.floor(clip.x * scaleX);
    const y = Math.floor(clip.y * scaleY);
    const width = Math.max(0, Math.round(clip.width * scaleX));
    const height = Math.max(0, Math.round(clip.height * scaleY));

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, width, height);
  }
}

interface WebGl2DataTextureFormatInfo {
  readonly internalFormat: number; // gl.R8 / gl.R32F / gl.RGBA8 / gl.RGBA32F
  readonly format: number; // gl.RED / gl.RGBA
  readonly type: number; // gl.UNSIGNED_BYTE / gl.FLOAT
  readonly channels: number;
}

// WebGL2RenderingContext is not defined in jsdom; resolve constants from
// the live gl context instead of the global class so test environments
// without WebGL2 still load this module.
function webgl2DataTextureFormat(format: DataTextureFormat): WebGl2DataTextureFormatInfo {
  const gl = WebGL2RenderingContext;
  switch (format) {
    case 'r8':
      return { internalFormat: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, channels: 1 };
    case 'r32f':
      return { internalFormat: gl.R32F, format: gl.RED, type: gl.FLOAT, channels: 1 };
    case 'rgba8':
      return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, channels: 4 };
    case 'rgba32f':
      return { internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, channels: 4 };
  }
}
