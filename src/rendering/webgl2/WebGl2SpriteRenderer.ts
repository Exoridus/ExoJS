import type { ReadonlyRectangle } from '#math/Rectangle';
import { packedGroupChanged } from '#rendering/affinePacking';
import type { Drawable } from '#rendering/Drawable';
import type { UniformValue } from '#rendering/material/Material';
import {
  createRetainedMaterialState,
  isRetainedMaterialState,
  isRetainedMaterialStateValid,
  type RetainedMaterialState,
} from '#rendering/material/RetainedMaterialState';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { RenderRootSource } from '#rendering/plan/RenderRootSource';
import { Shader } from '#rendering/shader/Shader';
import { composeSpriteMaterialFragmentGlsl, spriteMaterialTextureSlots, spriteVertexGlsl } from '#rendering/sprite/materialSources';
import { fillPersistentSpriteSlotTable, writePersistentSpriteSlots } from '#rendering/sprite/persistentSlots';
import type { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { createWebGl2ShaderProgram } from './shaderProgram';
import fragmentSource from './shaders/sprite.frag';
import vertexSource from './shaders/sprite.vert';
import indexedVertexSource from './shaders/sprite-indexed.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2PersistentSlotStore } from './WebGl2PersistentSlotStore';
import { uploadBufferRange, uploadBufferStore, WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import type { WebGl2RetainedBatchPayload, WebGl2RetainedBatchReplayer, WebGl2RetainedNodeIndexRange } from './WebGl2RetainedGroupResources';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

/**
 * Instanced sprite renderer for WebGL2.
 *
 * Each batch issues a single `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, N)`
 * with no per-vertex buffer - `gl_VertexID` 0..3 selects which corner of
 * the quad each invocation is computing. All per-sprite data lives in a
 * single per-instance buffer (divisor = 1).
 *
 * Per-instance layout (32 bytes per sprite, 4 attributes):
 * ```
 *   localBounds    f32x4       (offset  0, 16 bytes)  - left, top, right, bottom
 *   uvBounds       u16x4 norm  (offset 16,  8 bytes)  - uMin, vMin, uMax, vMax
 *   textureSlot    u32         (offset 24,  4 bytes)  - multi-texture slot
 *   nodeIndex      u32         (offset 28,  4 bytes)  - row into the shared TransformBuffer
 * ```
 *
 * Neither the per-instance world transform nor the tint live in this buffer:
 * both are fetched in the vertex shader from the shared {@link TransformBuffer}
 * state, keyed by `a_nodeIndex`, exactly like the mesh renderer - the
 * transform (`u_transforms`, 2 texels/row) and the tint (`u_tintTexture`, its
 * own rgba8 texel/row) are separate textures, both written at the
 * render-group upload boundary at the draw command's stable `nodeIndex`, so
 * the sprite reads both back instead of duplicating a per-instance color
 * stream. The vertex shader still expands one instance into four corners on
 * the GPU.
 *
 * # Default vs custom-material path
 *
 * Sprites without a material take the default path: up to 16 base textures
 * rotate through `u_texture0..15`, selected per-instance via `a_textureSlot`,
 * so unrelated sprites merge into one draw. Sprites with a {@link SpriteMaterial}
 * take the custom path: the material's fragment program runs against the same
 * instance buffer, up to {@link spriteMaterialTextureSlots} base textures
 * rotate through `u_texture0..7` behind the engine-spliced `sampleBase(slot,
 * uv)` helper, and material uniforms/textures bind once per batch on the units
 * above them. A custom batch breaks on material instance, blend mode, base
 * slot exhaustion, or buffer capacity - no longer on every base-texture switch.
 */

const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
// WebGL2 guarantees MAX_TEXTURE_IMAGE_UNITS >= 16, so a batch can bind up to 16
// distinct base textures and merge otherwise-unrelated sprites into one draw.
const maxBatchTextures = 16;
// Sprite base textures occupy units 0..15; the shared transform buffer texture
// binds on the next unit (16). That needs 17 combined units, well within the
// WebGL2 >= 32 MAX_COMBINED_TEXTURE_IMAGE_UNITS guarantee.
const transformTextureUnit = 16;
// One above the transform unit; the backend's render-target sync scratch unit
// (17) is only live transiently during a render-to-texture sync, never while a
// sprite draw's shader is active, so units stay disjoint in practice, but this
// still sits clear of it.
const transformTintTextureUnit = 18;
// The persistent-indexed variant's quad-attribute store. One above the tint
// unit, so the two shared-store units and this one stay disjoint from the
// 0..15 base-texture range and from the backend's render-target sync scratch.
const slotAttributeTextureUnit = 19;
// Material texture bindings occupy the units above the custom path's base-slot
// table (spriteMaterialTextureSlots..+6). The material CONTRACT stays at 7
// extra textures, matching WebGl2MeshRenderer and the WebGPU sprite renderer.
// Deliberately decoupled from maxBatchTextures - bumping the default-path
// batch capacity must not silently widen what materials may request. 8 base
// slots + 7 material textures = 15 fragment units, inside the WebGL2
// MAX_TEXTURE_IMAGE_UNITS >= 16 guarantee.
const maxCustomTextureSlots = 7;
// First texture unit a material's own textures may use.
const customTextureUnitBase = spriteMaterialTextureSlots;
const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

interface SpriteRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vaoHandle: WebGLVertexArrayObject;
}

export class WebGl2SpriteRenderer extends AbstractWebGl2Renderer<Sprite> implements WebGl2RetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in: default and live SpriteMaterial flushes
   * can be recorded into a group's instruction set and replayed from
   * group-owned resources.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  /** Custom SpriteMaterial batches implement the live-material replay contract. @internal */
  public _canRecordRetainedDrawable(drawable: Drawable): boolean {
    return (drawable as Sprite).material !== null;
  }

  private readonly _shader: Shader;
  /** Persistent-indexed program: same fragment stage, slot-fetching vertex stage. */
  private readonly _indexedShader: Shader;
  private _indexedVao: WebGl2VertexArrayObject | null = null;
  private _indexedVaoBuffer: WebGl2RenderBuffer | null = null;
  private readonly _slotAttributeUnitScratch: Int32Array = new Int32Array([slotAttributeTextureUnit]);
  private readonly _batchSize: number;
  private readonly _instanceData: ArrayBuffer;
  private readonly _instanceFloat32: Float32Array;
  private readonly _instanceUint32: Uint32Array;

  private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
  private readonly _textureSlots = new Map<Texture | RenderTexture, number>();
  private _slotCount = 0;
  // Effective base-texture slot cap for this context. Defaults to the compile-
  // time capacity and is clamped down at connect to the driver's reported
  // MAX_TEXTURE_IMAGE_UNITS - a defensive floor that WebGL2's >= 16 guarantee
  // means should never actually reduce the batch below maxBatchTextures.
  private _maxTextureSlots = maxBatchTextures;
  // Effective base-texture slot cap for the CUSTOM path. Smaller than
  // _maxTextureSlots on purpose: a material's own textures share the fragment
  // stage's unit budget (see maxCustomTextureSlots).
  private _maxCustomTextureSlots = spriteMaterialTextureSlots;

  // Custom-material state. Compiled fragment programs are cached per material
  // instance; the current batch's material/base-texture decide when to flush.
  private readonly _customShaders = new Map<SpriteMaterial, Shader>();
  // Texture-unit index scratches reused for sampler-uniform binds so the
  // per-batch path stays allocation-free.
  private readonly _slotScratches: Int32Array[] = Array.from({ length: maxBatchTextures }, (_, i) => new Int32Array([i]));
  // Pinned unit index for the shared transform buffer sampler.
  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  private readonly _tintUnitScratch: Int32Array = new Int32Array([transformTintTextureUnit]);
  private _currentMaterial: SpriteMaterial | null = null;
  private readonly _retainedPreparedEpoch = new WeakMap<SpriteMaterial, number>();
  // Local bounds resolved for the sprite currently being packed. Geometry-mode
  // boundary snapping now happens in the vertex shader, so this is always the
  // sprite's logical local bounds; the field lets _packInstance read the value
  // resolved once per render() call.
  private _activeBounds: ReadonlyRectangle | null = null;

  private _instanceCount = 0;
  // Highest transform-buffer row referenced by the pending batch; drives the
  // minimum row count uploaded for the transform texture at flush time.
  private _maxNodeIndex = 0;
  // Blend mode of the batch currently accumulating, used to detect a batch
  // break. It is not a mirror of the GL blend state: that state is global and
  // shared with every other renderer, so `flush()` establishes it at the draw.
  private _currentBlendMode: BlendModes | null = null;
  private _currentView: View | null = null;
  private _currentViewId = -1;
  private _hasWrittenGroup = false;
  private readonly _writtenGroupData = new Float32Array(9);

  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _connection: SpriteRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
    this._shader = new Shader(vertexSource, fragmentSource);
    this._indexedShader = new Shader(indexedVertexSource, fragmentSource);
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

    // The transform lives in the shared buffer, keyed by the draw command's
    // stable nodeIndex (already packed at the render-group upload boundary).
    // A direct, non-plan `backend.draw(sprite)` has no command - push the
    // sprite's transform into the buffer and use the freshly-allocated slot.
    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    this._activeBounds = this._resolveBounds(sprite);

    if (material === null) {
      this._renderDefault(sprite, texture, backend, nodeIndex);
    } else {
      this._renderCustom(sprite, texture, material, backend, nodeIndex);
    }

    return this;
  }

  /**
   * Local bounds to upload for `sprite` this draw: always the sprite's logical
   * local bounds. Geometry-mode boundary snapping is resolved in the vertex
   * shader (`snapBoundary` block, gated on the row's snap flag), so no CPU
   * bounds-snap happens here and logical state is never mutated. Consumed
   * synchronously by {@link _packInstance}.
   */
  private _resolveBounds(sprite: Sprite): ReadonlyRectangle {
    return sprite.getLocalBounds();
  }

  // ── Persistent-indexed selection ──────────────────────────────────────────
  // A render root whose whole subtree this renderer can serve draws out of
  // slot-addressed stores instead of a streamed instance buffer. Same program
  // family, same fragment stage, same batching rules - what changes is only
  // where the per-sprite record lives, which is what lets a camera step touch
  // just the items that entered or left.

  /** Capability flag, mirroring `_supportsRetainedBatches`. @internal */
  public readonly _supportsPersistentSlots = true;

  /**
   * Decide whether this renderer can serve every item in `source` from one slot
   * store, and allocate it if so.
   *
   * The rules are the shared sprite ones (see
   * {@link fillPersistentSpriteSlotTable}); what is backend-specific is only the
   * batch table's width and the store the answer is written into. Runs once per
   * built source, never per frame.
   * @internal
   */
  public _acquirePersistentSlotStore(source: RenderRootSource, backend: WebGl2Backend): WebGl2PersistentSlotStore | null {
    const store = new WebGl2PersistentSlotStore();

    if (!fillPersistentSpriteSlotTable(source, store, this._maxTextureSlots)) {
      store.destroy();

      return null;
    }

    store.connectDevice(backend.context, backend.accountant);

    return store;
  }

  /**
   * Fill the persistent rows of the items that just took a slot and push the
   * texture lines they landed on. See {@link writePersistentSpriteSlots} for why
   * this never touches a drawable.
   * @internal
   */
  public _writePersistentSlotRows(store: WebGl2PersistentSlotStore, source: RenderRootSource, entered: Int32Array, count: number): void {
    writePersistentSpriteSlots(store, source, entered, count);
    store.commitDirtyRows();
  }

  /**
   * Draw `count` instances, instance `i` reading slot `order[i]`.
   *
   * One `drawArraysInstanced` for the whole root: the store's texture table is
   * bound once, and the stream is issued verbatim. Nothing here may reorder or
   * split it - the stream IS the draw order the plan built.
   * @internal
   */
  public _drawPersistentSlots(store: WebGl2PersistentSlotStore, order: Uint32Array, count: number, backend: WebGl2Backend): void {
    if (count === 0) {
      return;
    }

    const gl = backend.context;
    const shader = this._indexedShader;
    const buffer = store.uploadOrder(order, count, () => this._createBufferRuntime(this._connection!));
    const vao = this._acquireIndexedVao(gl, buffer);

    backend.setBlendMode(store.blendMode);
    backend.bindShader(shader);
    shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));

    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }

    backend._stageViewportUniform(shader);
    backend.bindTexture(store.attributeTexture, slotAttributeTextureUnit);
    backend.bindTexture(store.transformTexture, transformTextureUnit);
    backend.bindTexture(store.tintTexture, transformTintTextureUnit);
    shader.sync();
    backend.bindVertexArrayObject(vao);

    for (let i = 0; i < store.textures.length; i++) {
      backend.bindTexture(store.textures[i]!, i);
    }

    vao.drawInstanced(4, 0, count, RenderingPrimitives.TriangleStrip);
    backend.stats.batches++;
    backend.stats.drawCalls++;
    backend.stats.submittedNodes += count;
  }

  /**
   * The VAO the indexed path draws through, rebuilt when the store's order
   * buffer is replaced (growth destroys it, so the pointer would dangle).
   */
  private _acquireIndexedVao(gl: WebGL2RenderingContext, buffer: WebGl2RenderBuffer): WebGl2VertexArrayObject {
    if (this._indexedVao !== null && this._indexedVaoBuffer === buffer) {
      return this._indexedVao;
    }

    this._indexedVao?.destroy();
    this._indexedVaoBuffer = buffer;
    this._indexedVao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(buffer, this._indexedShader.getAttribute('a_slot'), gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, 0, true, 1)
      .connect(this._createVaoRuntime(this._connection!));

    return this._indexedVao;
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const instanceBuffer = this._instanceBuffer;
    const vao = this._vao;
    const connection = this._connection;

    if (this._instanceCount === 0 || backend === null || instanceBuffer === null || vao === null || connection === null) {
      this._maxNodeIndex = 0;
      this._currentBlendMode = null;
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

      backend._stageViewportUniform(shader);

      // Base textures are already bound to their slot units by _renderCustom;
      // the sampler uniforms are pinned once when the program is compiled.
      this._stageCustomUniforms(shader, material);
      this._bindCustomTextures(shader, material, backend);
    }

    // Bind the shared transform buffer texture (one row per nodeIndex) on the
    // dedicated unit and point the sampler at it. Done for both the default and
    // custom programs - both fetch the world transform via a_nodeIndex.
    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);

    if (shader.uniforms.has('u_transforms')) {
      shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    backend.bindTintBufferTexture(transformTintTextureUnit);

    if (shader.uniforms.has('u_tintTexture')) {
      shader.getUniform('u_tintTexture').setValue(this._tintUnitScratch);
    }

    shader.sync();
    backend.bindVertexArrayObject(vao);
    instanceBuffer.upload(this._instanceFloat32, 0, this._instanceCount * wordsPerInstance);
    this._bindBaseTextureSamplers(backend, material, this._slotCount);
    // The GL blend state is global and any other renderer may have changed it
    // since this batch started accumulating, so it is established here - at the
    // draw - rather than where the batch break was detected.
    const blendMode = this._currentBlendMode ?? BlendModes.Normal;

    backend.setBlendMode(blendMode);
    vao.drawInstanced(4, 0, this._instanceCount, RenderingPrimitives.TriangleStrip);
    this._unbindBaseTextureSamplers(backend, material, this._slotCount);
    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Retained recording: cache byte-identical instance data and retain only a
    // live descriptor for custom material state.
    if (backend._isRetainedCapturing) {
      backend._recordRetainedBatch(
        this,
        this._instanceUint32.subarray(0, this._instanceCount * wordsPerInstance),
        this._instanceCount,
        blendMode,
        this._activeTextures,
        this._slotCount,
        null,
        material === null ? null : createRetainedMaterialState(material),
      );
    }

    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._currentBlendMode = null;

    this._resetSlots();
  }

  /**
   * Stage `u_projection` (live view) and `u_group` (live composed group
   * matrix) on the default shader, guarded by the cached view/group stamps.
   * Shared by the live flush path and retained-batch replay - replay resolves
   * exactly the same live state a slow-path flush would.
   */
  private _stageDefaultViewUniforms(backend: WebGl2Backend): void {
    const view = backend.view;

    if (this._currentView !== view || this._currentViewId !== view.updateId) {
      this._currentView = view;
      this._currentViewId = view.updateId;
      this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }

    if (this._shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;
      const groupData = groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3;

      if (!this._hasWrittenGroup || packedGroupChanged(groupData, this._writtenGroupData, 0)) {
        this._shader.getUniform('u_group').setValue(groupData);
        this._writtenGroupData.set(groupData);
        this._hasWrittenGroup = true;
      }
    }

    backend._stageViewportUniform(this._shader);
  }

  // ── Retained-batch record/replay ──────────────────────────────────────────
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

  /** @internal See {@link WebGl2RetainedBatchReplayer._rebaseRetainedNodeIndices} (rebases to group-local indices). */
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
   * Replay one recorded default-path batch: all STATE is resolved
   * live - blend mode via the backend's dedup, `u_projection` from the live
   * view, `u_group` from the live composed group matrix (the camera-pan /
   * group-move win), texture bindings by recorded slot order - and only the
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
    const tintTexture = payload.bundle.tintTexture;
    const materialState = this._retainedMaterialState(payload);
    const material = materialState?.material ?? null;

    if (backend === null || vao === null || transformTexture === null || tintTexture === null) {
      // Defensive: a bundle in this state never validates (generation), so a
      // spliced replay cannot reach here; skip rather than crash mid-frame.
      return;
    }

    backend.setBlendMode(payload.blendMode);
    const shader = material === null ? this._shader : this._getOrCreateCustomShader(material, backend.context);

    if (material === null) {
      this._stageDefaultViewUniforms(backend);
    } else {
      if (shader.uniforms.has('u_projection')) {
        shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
      }

      if (shader.uniforms.has('u_group')) {
        const groupTransform = backend.renderGroupTransform;

        shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
      }

      backend._stageViewportUniform(shader);

      if (this._retainedPreparedEpoch.get(material) !== backend.renderPlanEpoch) {
        this._stageCustomUniforms(shader, material);
        this._retainedPreparedEpoch.set(material, backend.renderPlanEpoch);
      }

      this._bindCustomTextures(shader, material, backend);
    }

    const textures = payload.textures;

    for (let i = 0; i < textures.length; i++) {
      // In-bounds: i < textures.length.
      backend.bindTexture(textures[i]!, i);
    }

    // The group-owned transform store replaces the shared frame buffer on the
    // SAME unit/sampler - zero GLSL changes. The next live flush
    // re-binds the shared texture through bindTransformBufferTexture.
    backend.bindTexture(transformTexture, transformTextureUnit);

    if (shader.uniforms.has('u_transforms')) {
      shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    backend.bindTexture(tintTexture, transformTintTextureUnit);

    if (shader.uniforms.has('u_tintTexture')) {
      shader.getUniform('u_tintTexture').setValue(this._tintUnitScratch);
    }

    shader.sync();
    backend.bindVertexArrayObject(vao);
    this._bindBaseTextureSamplers(backend, material, textures.length);
    vao.drawInstanced(4, 0, payload.instanceCount, RenderingPrimitives.TriangleStrip);
    this._unbindBaseTextureSamplers(backend, material, textures.length);
  }

  private _bindBaseTextureSamplers(backend: WebGl2Backend, material: SpriteMaterial | null, slotCount: number): void {
    const sampler = material?.sampler;

    if (sampler === null || sampler === undefined) {
      return;
    }

    for (let slot = 0; slot < slotCount; slot++) {
      backend.bindMaterialSampler(sampler, slot);
    }
  }

  private _unbindBaseTextureSamplers(backend: WebGl2Backend, material: SpriteMaterial | null, slotCount: number): void {
    if (material?.sampler === null || material?.sampler === undefined) {
      return;
    }

    for (let slot = 0; slot < slotCount; slot++) {
      backend.unbindMaterialSampler(slot);
    }
  }

  /** Structural preflight called for every batch before the set is spliced. @internal */
  public _validateRetainedBatch(payload: WebGl2RetainedBatchPayload): boolean {
    const state = this._retainedMaterialState(payload);

    return state === null || isRetainedMaterialStateValid(state);
  }

  private _retainedMaterialState(payload: WebGl2RetainedBatchPayload): RetainedMaterialState<SpriteMaterial> | null {
    return isRetainedMaterialState(payload.rendererData) ? (payload.rendererData as RetainedMaterialState<SpriteMaterial>) : null;
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    // Clamp the batch's base-texture capacity to what the driver actually
    // exposes to the fragment stage. WebGL2 mandates >= 16, so this is a
    // belt-and-braces floor that should never trim below maxBatchTextures.
    const maxImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number;

    this._maxTextureSlots = Math.min(maxBatchTextures, maxImageUnits);
    this._maxCustomTextureSlots = Math.min(spriteMaterialTextureSlots, this._maxTextureSlots);

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
    // can reach must have its sampler in the program - a silently unpinned
    // sampler would default to unit 0 and sample the wrong texture without
    // any error. Test mocks must therefore declare all 16 samplers (see
    // test/rendering/browser/_spriteFragMock.ts).
    const samplerUnit = new Int32Array(1);

    for (let i = 0; i < this._maxTextureSlots; i++) {
      samplerUnit[0] = i;
      this._shader.getUniform(`u_texture${i}`).setValue(samplerUnit);
    }

    this._indexedShader.connect(createWebGl2ShaderProgram(gl));
    this._indexedShader.sync();

    for (let i = 0; i < this._maxTextureSlots; i++) {
      samplerUnit[0] = i;
      this._indexedShader.getUniform(`u_texture${i}`).setValue(samplerUnit);
    }

    this._indexedShader.getUniform('u_slotAttributes').setValue(this._slotAttributeUnitScratch);
    this._indexedShader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    this._indexedShader.getUniform('u_tintTexture').setValue(this._tintUnitScratch);
  }

  protected onDisconnect(): void {
    this._shader.disconnect();
    this._indexedShader.disconnect();
    this._indexedVao?.destroy();
    this._indexedVao = null;

    for (const shader of this._customShaders.values()) {
      shader.destroy();
    }

    this._customShaders.clear();
    this._currentMaterial = null;
    this._instanceBuffer?.destroy();
    this._instanceBuffer = null;
    this._vao?.destroy();
    this._vao = null;
    this._connection = null;
    this._currentBlendMode = null;
    this._currentView = null;
    this._currentViewId = -1;
    this._hasWrittenGroup = false;
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
    }

    this._currentBlendMode = blendMode;
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

  /** Custom-material path: rotate the base texture through the material slot table, instanced. */
  private _renderCustom(sprite: Sprite, texture: Texture | RenderTexture, material: SpriteMaterial, backend: WebGl2Backend, nodeIndex: number): void {
    // The material owns its blend mode; the sprite's own blendMode overrides it
    // when set away from the default (Normal).
    const blendMode = sprite.blendMode === BlendModes.Normal ? material.blendMode : sprite.blendMode;
    const batchFull = this._instanceCount >= this._batchSize;
    const blendModeChanged = blendMode !== this._currentBlendMode;
    const materialChanged = material !== this._currentMaterial;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= this._maxCustomTextureSlots;

    if (this._instanceCount > 0 && (batchFull || blendModeChanged || materialChanged || slotExhausted)) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = material;

    // Resolve / assign texture slot, exactly as the default path does - the
    // spliced prologue's sampleBase() dispatches over it per fragment.
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

  private _packInstance(sprite: Sprite, texture: Texture | RenderTexture, slot: number, nodeIndex: number): void {
    const offset = this._instanceCount * wordsPerInstance;
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;

    // localBounds: left, top, right, bottom (offset 0..3) - device-snapped in
    // PixelSnapMode.Geometry, otherwise the logical local bounds.
    const bounds = this._activeBounds ?? sprite.getLocalBounds();

    f32[offset + 0] = bounds.left;
    f32[offset + 1] = bounds.top;
    f32[offset + 2] = bounds.right;
    f32[offset + 3] = bounds.bottom;

    // uvBounds at offset 4 - 8 bytes = 2 u32 slots, normalised u16x4.
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
    // shader reads it from the separate u_tintTexture (same value the
    // transform-buffer upload boundary wrote from this sprite's tint).
    u32[offset + 6] = slot;

    // nodeIndex (u32) at word 7 - row into the shared transform buffer.
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
    // contract is fixed regardless of the material author. The fragment gets
    // the engine's base-texture slot table spliced in, so `sampleBase` and the
    // `u_texture0..N-1` samplers behind it exist without the author declaring
    // them.
    const shader = new Shader(spriteVertexGlsl, composeSpriteMaterialFragmentGlsl(glsl.fragment));

    shader.connect(createWebGl2ShaderProgram(gl));
    // Links the program and populates `shader.uniforms`; the slot samplers can
    // only be pinned once that table exists (same order as `onConnect`).
    shader.sync();

    // Pin the slot samplers to units 0..N-1. Guarded by `has` (unlike the
    // default program's strict pinning): a fragment that never calls
    // `sampleBase` leaves every slot sampler unused, and the GLSL compiler
    // then drops all of them from the linked program.
    const samplerUnit = new Int32Array(1);

    for (let i = 0; i < this._maxCustomTextureSlots; i++) {
      const name = `u_texture${i}`;

      if (shader.uniforms.has(name)) {
        samplerUnit[0] = i;
        shader.getUniform(name).setValue(samplerUnit);
      }
    }

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

  private _stageCustomUniforms(shader: Shader, material: SpriteMaterial): void {
    for (const name of material._bindingSchema.scalarUniformNames) {
      if (shader.uniforms.has(name)) {
        shader.getUniform(name).setValue(this._marshalUniformValue(material._getUniformValue(name) as Exclude<UniformValue, Texture | RenderTexture>));
      }
    }

    let textureSlot = customTextureUnitBase;

    for (const name of material._bindingSchema.textureUniformNames) {
      this._stageCustomTextureUnit(shader, name, textureSlot++);
    }

    for (const name of material._bindingSchema.textureNames) {
      this._stageCustomTextureUnit(shader, name, textureSlot++);
    }
  }

  private _stageCustomTextureUnit(shader: Shader, name: string, textureSlot: number): void {
    if (textureSlot >= customTextureUnitBase + maxCustomTextureSlots) {
      throw new Error(`SpriteMaterial requested more than ${maxCustomTextureSlots} texture bindings.`);
    }

    if (shader.uniforms.has(name)) {
      shader.getUniform(name).setValue(this._slotScratches[textureSlot]!);
    }
  }

  private _bindCustomTextures(shader: Shader, material: SpriteMaterial, backend: WebGl2Backend): void {
    let textureSlot = customTextureUnitBase;

    for (const name of material._bindingSchema.textureUniformNames) {
      if (shader.uniforms.has(name)) {
        backend.bindTexture(material._getUniformValue(name) as Texture | RenderTexture, textureSlot);
      }
      textureSlot++;
    }

    for (const name of material._bindingSchema.textureNames) {
      if (shader.uniforms.has(name)) {
        backend.bindTexture(material._getTextureValue(name), textureSlot);
      }
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
        const state = connection.buffers.get(buffer);

        gl.bindBuffer(buffer.type, handle);

        if (state && state.dataByteLength >= buffer.uploadByteLength) {
          uploadBufferRange(gl, buffer, offset);
          state.dataByteLength = buffer.uploadByteLength;
        } else {
          uploadBufferStore(gl, buffer);
          connection.buffers.set(buffer, { handle, dataByteLength: buffer.uploadByteLength });
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
