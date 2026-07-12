import { Rectangle } from '#math/Rectangle';
import type { UniformValue } from '#rendering/material/Material';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Shader } from '#rendering/shader/Shader';
import type { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexGlsl } from '#rendering/sprite/spriteMaterialSources';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import fragmentSource from './glsl/sprite.frag';
import vertexSource from './glsl/sprite.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import type { WebGl2RetainedBatchPayload, WebGl2RetainedBatchReplayer, WebGl2RetainedNodeIndexRange } from './WebGl2RetainedGroupResources';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

/**
 * Instanced sprite renderer for WebGL2.
 *
 * Each batch issues a single `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, N)`
 * with no per-vertex buffer — `gl_VertexID` 0..3 selects which corner of
 * the quad each invocation is computing. All per-sprite data lives in a
 * single per-instance buffer (divisor = 1).
 *
 * Per-instance layout (32 bytes per sprite, 4 attributes):
 * ```
 *   localBounds    f32x4       (offset  0, 16 bytes)  — left, top, right, bottom
 *   uvBounds       u16x4 norm  (offset 16,  8 bytes)  — uMin, vMin, uMax, vMax
 *   textureSlot    u32         (offset 24,  4 bytes)  — multi-texture slot
 *   nodeIndex      u32         (offset 28,  4 bytes)  — row into the shared TransformBuffer
 * ```
 *
 * Neither the per-instance world transform nor the tint live in this buffer:
 * both are fetched in the vertex shader from the shared {@link TransformBuffer}
 * texture (`u_transforms`) keyed by `a_nodeIndex`, exactly like the mesh
 * renderer (transform = texels 0/1, tint = texel 2). The render-group upload
 * boundary already packs every draw command's transform AND tint into that
 * buffer at its stable `nodeIndex`, so the sprite reads both back instead of
 * duplicating a per-instance color stream. The vertex shader still expands one
 * instance into four corners on the GPU.
 *
 * # Default vs custom-material path
 *
 * Sprites without a material take the default path: up to 16 base textures
 * rotate through `u_texture0..15`, selected per-instance via `a_textureSlot`,
 * so unrelated sprites merge into one draw. Sprites with a {@link SpriteMaterial}
 * take the custom path: the material's fragment program runs against the same
 * instance buffer, the single base texture binds to unit 0 as `u_texture`, and
 * material uniforms/textures bind once per batch (units 1..7). The custom path
 * keeps instancing but not the opportunistic 16-slot merge — a custom batch
 * breaks on material instance, base texture, blend mode, or buffer capacity.
 */

const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
// WebGL2 guarantees MAX_TEXTURE_IMAGE_UNITS >= 16, so a batch can bind up to 16
// distinct base textures and merge otherwise-unrelated sprites into one draw.
const maxBatchTextures = 16;
// Sprite base textures occupy units 0..15; the shared transform buffer texture
// binds on the next unit (16). That needs 17 combined units, well within the
// WebGL2 >= 32 MAX_COMBINED_TEXTURE_IMAGE_UNITS guarantee.
const transformTextureUnit = 16;
// Custom-material texture bindings (base texture on unit 0 + material textures
// on units 1..7) keep the pre-16-slot cap: the material CONTRACT stays at 7
// extra textures, matching WebGl2MeshRenderer and the WebGPU sprite renderer.
// Deliberately decoupled from maxBatchTextures — bumping the default-path
// batch capacity must not silently widen what materials may request.
const maxCustomTextureSlots = 8;
const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

interface SpriteRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vaoHandle: WebGLVertexArrayObject;
}

export class WebGl2SpriteRenderer extends AbstractWebGl2Renderer<Sprite> implements WebGl2RetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in (Track B Slice 3, S3-D5.1): the DEFAULT
   * path's flushes can be recorded into a group's instruction set and
   * replayed from group-owned resources. Custom-material and pixel-snapped
   * draws are excluded by the plan-level recordability predicate (and
   * belt-and-braces poisoning below).
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _shader: Shader;
  private readonly _batchSize: number;
  private readonly _instanceData: ArrayBuffer;
  private readonly _instanceFloat32: Float32Array;
  private readonly _instanceUint32: Uint32Array;

  private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
  private readonly _textureSlots = new Map<Texture | RenderTexture, number>();
  private _slotCount = 0;
  // Effective base-texture slot cap for this context. Defaults to the compile-
  // time capacity and is clamped down at connect to the driver's reported
  // MAX_TEXTURE_IMAGE_UNITS — a defensive floor that WebGL2's >= 16 guarantee
  // means should never actually reduce the batch below maxBatchTextures.
  private _maxTextureSlots = maxBatchTextures;

  // Custom-material state. Compiled fragment programs are cached per material
  // instance; the current batch's material/base-texture decide when to flush.
  private readonly _customShaders = new Map<SpriteMaterial, Shader>();
  // Texture-unit index scratches reused for sampler-uniform binds so the
  // per-batch path stays allocation-free.
  private readonly _slotScratches: Int32Array[] = Array.from({ length: maxBatchTextures }, (_, i) => new Int32Array([i]));
  // Pinned unit index for the shared transform buffer sampler.
  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  private _currentMaterial: SpriteMaterial | null = null;
  private _currentBaseTexture: Texture | RenderTexture | null = null;
  // Reusable scratch for device-snapped local bounds ('geometry' mode), and the
  // bounds resolved for the sprite currently being packed (snapped or logical).
  private readonly _snapBounds: Rectangle = new Rectangle();
  private _activeBounds: Rectangle | null = null;

  private _instanceCount = 0;
  // Highest transform-buffer row referenced by the pending batch; drives the
  // minimum row count uploaded for the transform texture at flush time.
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentView: View | null = null;
  private _currentViewId = -1;
  private _currentGroupTransformId = -1;

  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _connection: SpriteRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
    this._shader = new Shader(vertexSource, fragmentSource);
    this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
  }

  public render(sprite: Sprite): this {
    const texture = sprite.texture;

    if (texture === null) {
      return this;
    }

    const backend = this.getBackend();
    const material = sprite.material;

    // Belt-and-braces for retained recording (S3-D5.2/5.3): the collect-time
    // recordability predicate excludes custom-material and pixel-snapped
    // draws from ever arming a capture. If one still arrives inside an
    // active capture window, poison the recording so the resulting set can
    // never validate — degrading to entry replay instead of wrong pixels.
    if (backend._isRetainedCapturing && (material !== null || sprite.pixelSnapMode !== 'none')) {
      backend._poisonRetainedCaptures();
    }

    // The transform lives in the shared buffer, keyed by the draw command's
    // stable nodeIndex (already packed at the render-group upload boundary).
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

    return this;
  }

  /**
   * Local bounds to upload for `sprite` this draw: device-pixel-snapped in
   * `'geometry'` pixel-snap mode (axis-aligned only), otherwise the sprite's
   * logical local bounds. Reuses a scratch rectangle and never mutates logical
   * state. Consumed synchronously by {@link _packInstance}.
   */
  private _resolveBounds(sprite: Sprite, backend: WebGl2Backend): Rectangle {
    if (sprite.pixelSnapMode !== 'geometry') {
      return sprite.getLocalBounds();
    }

    const snap = backend._getSnapPixelSize();

    return sprite.getRenderBounds(backend.view, snap.width, snap.height, this._snapBounds);
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const instanceBuffer = this._instanceBuffer;
    const vao = this._vao;
    const connection = this._connection;

    if (this._instanceCount === 0 || backend === null || instanceBuffer === null || vao === null || connection === null) {
      this._maxNodeIndex = 0;
      this._resetSlots();

      return;
    }

    const material = this._currentMaterial;
    const shader = material === null ? this._shader : this._getOrCreateCustomShader(material, connection.gl);

    if (material === null) {
      this._stageDefaultViewUniforms(backend);
    } else {
      // Custom path: projection is set per flush (cheap, and the cached
      // default-shader view state does not carry over to a custom program).
      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
      }

      if (shader.uniforms.has('u_group')) {
        const groupTransform = backend.renderGroupTransform;

        shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
      }

      // The single base texture binds to unit 0 as `u_texture`.
      const baseTexture = this._currentBaseTexture;

      if (baseTexture !== null && shader.uniforms.has('u_texture')) {
        backend.bindTexture(baseTexture, 0);
        // In-bounds: `_slotScratches` is pre-allocated with `maxBatchTextures` (>= 1) entries.
        shader.getUniform('u_texture').setValue(this._slotScratches[0]!);
      }

      this._bindCustomUniforms(shader, material, backend);
    }

    // Bind the shared transform buffer texture (one row per nodeIndex) on the
    // dedicated unit and point the sampler at it. Done for both the default and
    // custom programs — both fetch the world transform via a_nodeIndex.
    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);

    if (shader.uniforms.has('u_transforms')) {
      shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    shader.sync();
    backend.bindVertexArrayObject(vao);
    instanceBuffer.upload(this._instanceFloat32.subarray(0, this._instanceCount * wordsPerInstance));
    vao.drawInstanced(4, 0, this._instanceCount, RenderingPrimitives.TriangleStrip);
    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Retained recording (Slice 3, Task 6): while a capture window is open,
    // hand the exact packed instance words of this DEFAULT-path flush to the
    // backend — byte-identical to what just drew, no duplicated packing
    // logic. Custom-material batches are never recorded (the render()-time
    // poison above already invalidated the capture if one slipped through).
    if (material === null && backend._isRetainedCapturing) {
      backend._recordRetainedBatch(
        this,
        this._instanceUint32.subarray(0, this._instanceCount * wordsPerInstance),
        this._instanceCount,
        this._currentBlendMode ?? BlendModes.Normal,
        this._activeTextures,
        this._slotCount,
      );
    }

    this._instanceCount = 0;
    this._maxNodeIndex = 0;

    this._resetSlots();
  }

  /**
   * Stage `u_projection` (live view) and `u_group` (live composed group
   * matrix) on the default shader, guarded by the cached view/group stamps.
   * Shared by the live flush path and retained-batch replay — replay resolves
   * exactly the same live state a slow-path flush would (S3-D1).
   */
  private _stageDefaultViewUniforms(backend: WebGl2Backend): void {
    const view = backend.view;

    if (this._currentView !== view || this._currentViewId !== view.updateId) {
      this._currentView = view;
      this._currentViewId = view.updateId;
      this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }

    if (this._shader.uniforms.has('u_group') && this._currentGroupTransformId !== backend.renderGroupTransformId) {
      this._currentGroupTransformId = backend.renderGroupTransformId;

      const groupTransform = backend.renderGroupTransform;

      this._shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }
  }

  // ── Retained-batch record/replay (Track B Slice 3, Tasks 6/7) ────────────
  // The bundle stores raw instance bytes; this renderer owns the 32-byte
  // layout, so the layout-aware finalize steps (node-index scan/rebase, VAO
  // attribute wiring) and the replay dispatch live here.

  /** @internal See {@link WebGl2RetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(payload: WebGl2RetainedBatchPayload, range: WebGl2RetainedNodeIndexRange): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      // In-bounds: the payload's word range was appended to the bundle store.
      // nodeIndex is the last word of the 32-byte (8-word) instance layout.
      const node = words[start + i * wordsPerInstance + 7]!;

      if (node < range.min) {
        range.min = node;
      }

      if (node > range.max) {
        range.max = node;
      }
    }
  }

  /** @internal See {@link WebGl2RetainedBatchReplayer._rebaseRetainedNodeIndices} (S3-D4: group-local indices). */
  public _rebaseRetainedNodeIndices(payload: WebGl2RetainedBatchPayload, base: number): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      const index = start + i * wordsPerInstance + 7;

      // In-bounds: see the scan above.
      words[index] = (words[index]! - base) >>> 0;
    }
  }

  /**
   * Point the batch VAO's per-instance attributes at the bundle's persistent
   * instance buffer, based at the batch's byte offset (WebGL2 has no
   * baseInstance, hence one small VAO per recorded batch). Same attribute
   * set/locations as the live VAO in {@link onConnect}.
   * @internal
   */
  public _configureRetainedVao(payload: WebGl2RetainedBatchPayload): void {
    const gl = this.getBackend().context;
    const buffer = payload.bundle.instanceBuffer;
    const vao = payload.vao;

    if (buffer === null || vao === null) {
      throw new Error('WebGl2SpriteRenderer: retained batch VAO configuration requires an uploaded bundle.');
    }

    const base = payload.byteOffset;

    vao
      .addAttribute(buffer, this._shader.getAttribute('a_localBounds'), gl.FLOAT, false, instanceStrideBytes, base + 0, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, base + 16, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_textureSlot'), gl.UNSIGNED_INT, false, instanceStrideBytes, base + 24, true, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, instanceStrideBytes, base + 28, true, 1);
  }

  /**
   * Replay one recorded default-path batch (Task 7): all STATE is resolved
   * live — blend mode via the backend's dedup, `u_projection` from the live
   * view, `u_group` from the live composed group matrix (the camera-pan /
   * group-move win), texture bindings by recorded slot order — and only the
   * DATA is cached: the instance bytes in the bundle buffer (bound through
   * the per-batch VAO) and the group-owned transform texture on the shared
   * transform unit. The backend hook flushed any pending live batch before
   * dispatching here and bumps the stats from the instruction descriptor.
   * @internal
   */
  public _replayRetainedBatch(payload: WebGl2RetainedBatchPayload): void {
    const backend = this.getBackendOrNull();
    const vao = payload.vao;
    const transformTexture = payload.bundle.transformTexture;

    if (backend === null || vao === null || transformTexture === null) {
      // Defensive: a bundle in this state never validates (generation), so a
      // spliced replay cannot reach here; skip rather than crash mid-frame.
      return;
    }

    // Keep this renderer's blend tracking in sync so the next live batch
    // still detects its own blend changes correctly.
    if (payload.blendMode !== this._currentBlendMode) {
      this._currentBlendMode = payload.blendMode;
    }

    backend.setBlendMode(payload.blendMode);
    this._stageDefaultViewUniforms(backend);

    const textures = payload.textures;

    for (let i = 0; i < textures.length; i++) {
      // In-bounds: i < textures.length.
      backend.bindTexture(textures[i]!, i);
    }

    // The group-owned transform store replaces the shared frame buffer on the
    // SAME unit/sampler — zero GLSL changes (S3-D4). The next live flush
    // re-binds the shared texture through bindTransformBufferTexture.
    backend.bindTexture(transformTexture, transformTextureUnit);

    if (this._shader.uniforms.has('u_transforms')) {
      this._shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    this._shader.sync();
    backend.bindVertexArrayObject(vao);
    vao.drawInstanced(4, 0, payload.instanceCount, RenderingPrimitives.TriangleStrip);
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    // Clamp the batch's base-texture capacity to what the driver actually
    // exposes to the fragment stage. WebGL2 mandates >= 16, so this is a
    // belt-and-braces floor that should never trim below maxBatchTextures.
    const maxImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;

    this._maxTextureSlots = Math.min(maxBatchTextures, maxImageUnits);

    this._shader.connect(createWebGl2ShaderProgram(gl));
    this._connection = this._createConnection(gl);
    this._instanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._instanceData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(this._connection),
      backend.accountant,
    );
    this._shader.sync();

    this._vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_localBounds'), gl.FLOAT, false, instanceStrideBytes, 0, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, 16, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_textureSlot'), gl.UNSIGNED_INT, false, instanceStrideBytes, 24, true, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, instanceStrideBytes, 28, true, 1)
      .connect(this._createVaoRuntime(this._connection));

    // Pin the per-slot sampler uniforms to texture units 0..N-1. Strict on
    // purpose (getUniform throws on a missing name): every slot the batcher
    // can reach must have its sampler in the program — a silently unpinned
    // sampler would default to unit 0 and sample the wrong texture without
    // any error. Test mocks must therefore declare all 16 samplers (see
    // test/rendering/browser/_spriteFragMock.ts).
    const samplerUnit = new Int32Array(1);

    for (let i = 0; i < this._maxTextureSlots; i++) {
      samplerUnit[0] = i;
      this._shader.getUniform(`u_texture${i}`).setValue(samplerUnit);
    }
  }

  protected onDisconnect(): void {
    this._shader.disconnect();

    for (const shader of this._customShaders.values()) {
      shader.destroy();
    }

    this._customShaders.clear();
    this._currentMaterial = null;
    this._currentBaseTexture = null;
    this._instanceBuffer?.destroy();
    this._instanceBuffer = null;
    this._vao?.destroy();
    this._vao = null;
    this._connection = null;
    this._currentBlendMode = null;
    this._currentView = null;
    this._currentViewId = -1;
    this._currentGroupTransformId = -1;
    this._instanceCount = 0;
    this._maxNodeIndex = 0;
  }

  public destroy(): void {
    this.disconnect();
    this._shader.destroy();
  }

  /** Default multi-texture path: rotate the base texture through 16 slots. */
  private _renderDefault(sprite: Sprite, texture: Texture | RenderTexture, backend: WebGl2Backend, nodeIndex: number): void {
    const blendMode = sprite.blendMode;
    const batchFull = this._instanceCount >= this._batchSize;
    const blendModeChanged = blendMode !== this._currentBlendMode;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= this._maxTextureSlots;
    // A custom batch in flight must drain before default sprites resume.
    const materialSwitch = this._currentMaterial !== null && this._instanceCount > 0;

    if (batchFull || blendModeChanged || slotExhausted || materialSwitch) {
      this.flush();

      if (blendModeChanged) {
        this._currentBlendMode = blendMode;
        backend.setBlendMode(blendMode);
      }
    }

    this._currentMaterial = null;

    let slot = this._textureSlots.get(texture);

    if (slot === undefined) {
      slot = this._slotCount++;
      this._textureSlots.set(texture, slot);
      this._activeTextures[slot] = texture;
      backend.bindTexture(texture, slot);
    }

    this._packInstance(sprite, texture, slot, nodeIndex);
    this._instanceCount++;
  }

  /** Custom-material path: single base texture on unit 0, instanced. */
  private _renderCustom(sprite: Sprite, texture: Texture | RenderTexture, material: SpriteMaterial, backend: WebGl2Backend, nodeIndex: number): void {
    // The material owns its blend mode; the sprite's own blendMode overrides it
    // when set away from the default (Normal).
    const blendMode = sprite.blendMode === BlendModes.Normal ? material.blendMode : sprite.blendMode;
    const batchFull = this._instanceCount >= this._batchSize;
    const blendModeChanged = blendMode !== this._currentBlendMode;
    const materialChanged = material !== this._currentMaterial;
    const textureChanged = texture !== this._currentBaseTexture;

    if (this._instanceCount > 0 && (batchFull || blendModeChanged || materialChanged || textureChanged)) {
      this.flush();
    }

    if (blendModeChanged) {
      this._currentBlendMode = blendMode;
      backend.setBlendMode(blendMode);
    }

    this._currentMaterial = material;
    this._currentBaseTexture = texture;

    // textureSlot word is unused by custom fragments (base binds to unit 0).
    this._packInstance(sprite, texture, 0, nodeIndex);
    this._instanceCount++;
  }

  private _packInstance(sprite: Sprite, texture: Texture | RenderTexture, slot: number, nodeIndex: number): void {
    const offset = this._instanceCount * wordsPerInstance;
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;

    // localBounds: left, top, right, bottom (offset 0..3) — device-snapped in
    // 'geometry' pixel-snap mode, otherwise the logical local bounds.
    const bounds = this._activeBounds ?? sprite.getLocalBounds();

    f32[offset + 0] = bounds.left;
    f32[offset + 1] = bounds.top;
    f32[offset + 2] = bounds.right;
    f32[offset + 3] = bounds.bottom;

    // uvBounds at offset 4 — 8 bytes = 2 u32 slots, normalised u16x4.
    // Pack (uMin, vMin, uMax, vMax) into two uint32s, with flipY swap
    // applied at pack time so the shader can stay flip-agnostic.
    const frame = sprite.textureFrame;
    const texWidth = texture.width;
    const texHeight = texture.height;
    // Clamp to 16-bit unsigned range for normalisation.
    const uMin = ((frame.left / texWidth) * 0xffff) & 0xffff;
    const uMax = ((frame.right / texWidth) * 0xffff) & 0xffff;
    const vMinRaw = ((frame.top / texHeight) * 0xffff) & 0xffff;
    const vMaxRaw = ((frame.bottom / texHeight) * 0xffff) & 0xffff;
    const vMin = texture.flipY ? vMaxRaw : vMinRaw;
    const vMax = texture.flipY ? vMinRaw : vMaxRaw;

    u32[offset + 4] = uMin | (vMin << 16);
    u32[offset + 5] = uMax | (vMax << 16);

    // textureSlot (u32) at word 6. The tint is NOT packed here: the vertex
    // shader reads it from the shared transform slot's texel 2 (same value the
    // transform-buffer upload boundary wrote from this sprite's tint).
    u32[offset + 6] = slot;

    // nodeIndex (u32) at word 7 — row into the shared transform buffer.
    const node = nodeIndex >>> 0;

    u32[offset + 7] = node;

    if (node > this._maxNodeIndex) {
      this._maxNodeIndex = node;
    }
  }

  private _getOrCreateCustomShader(material: SpriteMaterial, gl: WebGL2RenderingContext): Shader {
    const cached = this._customShaders.get(material);

    if (cached !== undefined) {
      return cached;
    }

    const glsl = material.shader.glsl;

    if (glsl === null) {
      throw new Error('SpriteMaterial shader has no `glsl` source; cannot render through the WebGL2 backend.');
    }

    // The engine owns the vertex stage: pair the canonical sprite vertex shader
    // with the material's fragment so the corner-expansion / instancing
    // contract is fixed regardless of the material author.
    const shader = new Shader(spriteVertexGlsl, glsl.fragment);

    shader.connect(createWebGl2ShaderProgram(gl));
    shader.sync();

    this._customShaders.set(material, shader);

    material._onDispose(() => {
      const stored = this._customShaders.get(material);

      if (stored !== undefined) {
        stored.destroy();
        this._customShaders.delete(material);
      }
    });

    return shader;
  }

  private _bindCustomUniforms(shader: Shader, material: SpriteMaterial, backend: WebGl2Backend): void {
    // Texture bindings take consecutive units starting at 1 (unit 0 belongs to
    // the sprite's own base texture). Texture-valued uniforms bind first, then
    // the entries of the material's dedicated `textures` map.
    let textureSlot = 1;

    const uniforms = material.uniforms;

    for (const name in uniforms) {
      if (!shader.uniforms.has(name)) {
        continue;
      }

      // `name` iterates own keys of `uniforms`, so the lookup is defined.
      const value = uniforms[name]!;
      const uniform = shader.getUniform(name);

      if (value instanceof Texture || value instanceof RenderTexture) {
        if (textureSlot >= maxCustomTextureSlots) {
          throw new Error(`SpriteMaterial requested more than ${maxCustomTextureSlots - 1} texture bindings.`);
        }

        backend.bindTexture(value, textureSlot);
        // In-bounds: `textureSlot < maxCustomTextureSlots <= maxBatchTextures`
        // (guarded) and `_slotScratches` has `maxBatchTextures` entries.
        uniform.setValue(this._slotScratches[textureSlot]!);
        textureSlot++;
      } else {
        uniform.setValue(this._marshalUniformValue(value));
      }
    }

    const textures = material.textures;

    for (const name in textures) {
      if (!shader.uniforms.has(name)) {
        continue;
      }

      if (textureSlot >= maxCustomTextureSlots) {
        throw new Error(`SpriteMaterial requested more than ${maxCustomTextureSlots - 1} texture bindings.`);
      }

      // `name` iterates own keys of `textures`, so the lookup is defined.
      backend.bindTexture(textures[name]!, textureSlot);
      shader.getUniform(name).setValue(this._slotScratches[textureSlot]!);
      textureSlot++;
    }
  }

  private _marshalUniformValue(value: Exclude<UniformValue, Texture | RenderTexture>): Float32Array | Int32Array {
    if (value instanceof Float32Array || value instanceof Int32Array) {
      return value;
    }

    if (typeof value === 'number') {
      return new Float32Array([value]);
    }

    return new Float32Array(value as readonly number[]);
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

  private _createConnection(gl: WebGL2RenderingContext): SpriteRendererConnection {
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2SpriteRenderer: could not create vertex array object.');
    }

    return {
      gl,
      buffers: new Map(),
      vaoHandle,
    };
  }

  private _createBufferRuntime(connection: SpriteRendererConnection): WebGl2RenderBufferRuntime {
    const handle = connection.gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2SpriteRenderer: could not create render buffer.');
    }

    return {
      bind: (buffer): void => {
        connection.gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer, offset): void => {
        const gl = connection.gl;
        const data = buffer.data;
        const state = connection.buffers.get(buffer);

        gl.bindBuffer(buffer.type, handle);

        if (state && state.dataByteLength >= data.byteLength) {
          gl.bufferSubData(buffer.type, offset, data);
          state.dataByteLength = data.byteLength;
        } else {
          gl.bufferData(buffer.type, data, buffer.usage);
          connection.buffers.set(buffer, { handle, dataByteLength: data.byteLength });
        }
      },
      destroy: (buffer): void => {
        connection.gl.deleteBuffer(handle);
        connection.buffers.delete(buffer);
        buffer.disconnect();
      },
    };
  }

  private _createVaoRuntime(connection: SpriteRendererConnection): WebGl2VertexArrayObjectRuntime {
    let appliedVersion = -1;

    return {
      bind: (vao): void => {
        const gl = connection.gl;

        gl.bindVertexArray(connection.vaoHandle);

        if (appliedVersion !== vao.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attribute of vao.attributes) {
            if (lastBuffer !== attribute.buffer) {
              attribute.buffer.bind();
              lastBuffer = attribute.buffer;
            }

            if (attribute.integer) {
              gl.vertexAttribIPointer(attribute.location, attribute.size, attribute.type, attribute.stride, attribute.start);
            } else {
              gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            }

            gl.enableVertexAttribArray(attribute.location);
            gl.vertexAttribDivisor(attribute.location, attribute.divisor);
          }

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        connection.gl.bindVertexArray(null);
      },
      draw: (_vao, size, start, type): void => {
        connection.gl.drawArrays(type, start, size);
      },
      drawInstanced: (_vao, count, start, instanceCount, type): void => {
        connection.gl.drawArraysInstanced(type, start, count, instanceCount);
      },
      destroy: (vao): void => {
        connection.gl.deleteVertexArray(connection.vaoHandle);
        vao.disconnect();
      },
    };
  }
}
