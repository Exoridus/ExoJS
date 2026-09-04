import { Matrix } from '#math/Matrix';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { Material, UniformValue } from '#rendering/material/Material';
import type { MeshIndexArray, MeshIndexFormat } from '#rendering/mesh/indices';
import { createIndexArray } from '#rendering/mesh/indices';
import type { Mesh } from '#rendering/mesh/Mesh';
import { type DrawCommand, RenderEntryKind } from '#rendering/plan/renderCommand';
import type { InstanceDataView } from '#rendering/RenderBatch';
import { Shader } from '#rendering/shader/Shader';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, IndexElementTypes, RenderingPrimitives } from '#rendering/types';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import { createWebGl2ShaderProgram } from './shaderProgram';
import fragmentSource from './shaders/mesh.frag';
import vertexSource from './shaders/mesh.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { uploadBufferRange, uploadBufferStore, WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import type { WebGl2RetainedBatchPayload, WebGl2RetainedBatchReplayer, WebGl2RetainedNodeIndexRange } from './WebGl2RetainedGroupResources';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// Per-vertex layout (20 bytes):
//   position: vec2 f32 (offset  0,  8 bytes)
//   texcoord: vec2 f32 (offset  8,  8 bytes)
//   color:    u8x4 norm (offset 16, 4 bytes)
const vertexStrideBytes = 20;
const vertexStrideWords = vertexStrideBytes / 4;
const initialVertexCapacity = 64;
const initialIndexCapacity = 192;
const initialNodeIndexCapacity = 64;
const defaultVertexColor = 0xffffffff; // white, full alpha
const maxCustomTextureSlots = 8;
const transformTextureUnit = 8;
const transformTintTextureUnit = 9;
const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

interface MeshRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly dynamicVao: WebGl2VertexArrayObject;
  readonly dynamicVertexBuffer: WebGl2RenderBuffer;
  readonly dynamicIndexBuffer: WebGl2RenderBuffer;
  readonly dynamicNodeIndexBuffer: WebGl2RenderBuffer;
  // Shared divisor-1 stream for a batch's free per-instance attributes. Re-filled
  // per drawBatch; its VAO layout varies per batch, hence the per-layout VAOs.
  readonly dynamicInstanceBuffer: WebGl2RenderBuffer;
}

// Mutable so the per-frame pool (`_pendingDraws` + `_pendingCount` cursor) can
// reuse slots: `render()` overwrites every field of a reclaimed slot instead of
// allocating a fresh literal. EVERY field must be rewritten per reuse (a stale
// `command`/`material`/`texture`/`supportsInstancing` from the previous frame
// would render a ghost mesh).
interface PendingMeshDraw {
  mesh: Mesh;
  command: DrawCommand | null;
  material: Material | null;
  shader: Shader;
  blendMode: BlendModes;
  texture: Texture | RenderTexture;
  supportsInstancing: boolean;
}

/** WebGL2 element type for a mesh index width. */
const glIndexType = (format: MeshIndexFormat): IndexElementTypes => (format === 'uint32' ? IndexElementTypes.UnsignedInt : IndexElementTypes.UnsignedShort);

interface GeometryCacheEntry {
  readonly geometry: Geometry;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly indexBuffer: WebGl2RenderBuffer;
  // Keyed by shader, then by the batch's instance-attribute layout: the same
  // geometry+shader pair needs a distinct VAO per divisor-1 layout bound to it.
  readonly vaos: Map<Shader, Map<string, WebGl2VertexArrayObject>>;
  readonly disposeListener: () => void;
  indexCount: number;
  /** Index width the buffer currently holds; every VAO cached here draws with it. */
  indexFormat: MeshIndexFormat;
  // The geometry version the buffers currently hold. Re-packed on mismatch, so
  // dynamic/stream geometry reaches the GPU via Geometry.invalidate(). The
  // buffer objects themselves are reused, which keeps the cached VAOs valid.
  version: number;
}

export class WebGl2MeshRenderer extends AbstractWebGl2Renderer<Mesh> implements WebGl2RetainedBatchReplayer {
  /**
   * Retained-batch opt-in: the default-path static
   * instanced draw ({@link _drawStaticBatch}) is a flush-level batch the group
   * recorder can capture and replay. Custom-material and dynamic-geometry
   * meshes never take that path; both are excluded at collect time (own
   * material by the predicate's own-material rule, geometry storage by
   * {@link _admitsRetainedRecording}), so no capture opens around them.
   */
  public readonly _supportsRetainedBatches = true;

  /**
   * Only a mesh backed by SHARED, STATIC {@link Geometry} is recordable: that is
   * the one form whose vertex/index buffers are the persistent objects a
   * retained batch references. An array-vertex mesh (`geometry === null`) and a
   * `dynamic`/`stream` geometry both re-pack into the renderer's own scratch
   * buffers every frame, so they take {@link _drawDynamicInstancedSingle} and
   * poison the capture there. Vetoing them at collect time is what keeps that
   * poison the dead safety net its contract describes - without it a group of
   * array meshes records and re-poisons on every single frame.
   *
   * The verdict is cached per capture, so it would go stale if this answer could
   * flip under a live capture. It cannot for any mesh that can appear in one:
   * `Geometry.usage` is readonly, and `Mesh._geometry` is written once in the
   * constructor. The one subclass that rewrites it, the pooled `ImmediateMesh`,
   * is submitted straight to the backend by `RenderingContext.drawGeometry` /
   * `drawBatch` and never enters the scene graph, so it is never a captured
   * fragment entry.
   * @internal
   */
  public _admitsRetainedRecording(drawable: Drawable): boolean {
    return (drawable as Mesh).geometry?.usage === 'static';
  }

  /** Reusable single-slot texture list handed to the recorder (avoids a per-batch array). */
  private readonly _retainedTextureScratch: [Texture | RenderTexture] = [Texture.white];

  private readonly _defaultShader: Shader = new Shader(vertexSource, fragmentSource);
  private readonly _customShaders = new Map<Material, Shader>();
  private readonly _compatibilityCache = new Map<Shader, boolean>();
  private readonly _textureUnitScratch: Int32Array = new Int32Array([0]);
  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  private readonly _tintUnitScratch: Int32Array = new Int32Array([transformTintTextureUnit]);
  // Pre-built texture-unit indices used for custom-shader sampler bindings;
  // pre-allocated so the per-frame uniform path stays allocation-free.
  private readonly _slotScratches: Int32Array[] = Array.from(
    { length: Math.max(transformTextureUnit + 1, transformTintTextureUnit + 1, maxCustomTextureSlots + 1) },
    (_, i) => new Int32Array([i]),
  );
  private readonly _groupComposeScratch = new Matrix();

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _nodeIndexCapacity = initialNodeIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);
  /**
   * 32-bit staging, allocated only once a mesh actually needs it. Kept separate
   * from the 16-bit array rather than replacing it: the common mesh is far below
   * the 16-bit ceiling, and promoting the shared scratch on first sight of a wide
   * mesh would double the upload bytes of every mesh after it for the rest of the
   * session.
   */
  private _indexData32: Uint32Array = new Uint32Array(0);
  private _nodeIndexData: Uint32Array = new Uint32Array(initialNodeIndexCapacity);
  // Initial (empty) backing data for the shared divisor-1 instance buffer; a
  // draw uploads the packed prefix of the RenderBatch's own storage directly.
  private readonly _instanceAttributeData: Float32Array = new Float32Array(0);

  // Frame-persistent pool of pending-draw slots. `render()` fills slots front to
  // back up to `_pendingCount`; `flush()` consumes `[0, _pendingCount)` and then
  // only resets the cursor (the slot objects survive for the next frame, so no
  // PendingMeshDraw literal is allocated per mesh per frame).
  private readonly _pendingDraws: PendingMeshDraw[] = [];
  private _pendingCount = 0;
  private readonly _geometryCache = new Map<Geometry, GeometryCacheEntry>();
  private _connection: MeshRendererConnection | null = null;

  public render(mesh: Mesh): void {
    const connection = this._connection;

    if (!connection) {
      throw new Error('WebGl2MeshRenderer is not connected to a backend.');
    }

    if (mesh.vertexCount === 0) {
      return;
    }

    const backend = this.getBackend();
    const material = mesh.material;
    const shader = material === null ? this._defaultShader : this._getOrCreateCustomShader(material, connection.gl);
    // The material owns its blend mode; the mesh's own blendMode overrides it
    // when set away from the default (Normal). Default-path meshes keep their
    // own blendMode verbatim.
    const blendMode = material !== null && mesh.blendMode === BlendModes.Normal ? material.blendMode : mesh.blendMode;
    const texture = mesh.texture ?? Texture.white;
    const command = backend.activeDrawCommand;
    const supportsInstancing = material === null ? true : this._isInstancingCompatible(shader);

    // Reuse a pooled slot if one exists at the cursor, otherwise grow the pool.
    // Overwrite every field (see PendingMeshDraw): a forgotten field leaks the
    // previous frame's mesh into this slot.
    let slot = this._pendingDraws[this._pendingCount];

    if (slot === undefined) {
      slot = { mesh, command, material, shader, blendMode, texture, supportsInstancing };
      this._pendingDraws.push(slot);
    } else {
      slot.mesh = mesh;
      slot.command = command;
      slot.material = material;
      slot.shader = shader;
      slot.blendMode = blendMode;
      slot.texture = texture;
      slot.supportsInstancing = supportsInstancing;
    }

    this._pendingCount++;
  }

  /**
   * Draw `mesh`'s geometry once as an explicit instanced batch over the
   * contiguous transform slots `[startNodeIndex, startNodeIndex + count)`,
   * already written into the shared transform buffer by the backend. Drawn
   * immediately (not deferred through the pending-draw queue). Backs
   * {@link RenderingContext.drawBatch} via {@link WebGl2Backend.drawInstanced}.
   * @internal
   */
  public drawInstancedBatch(mesh: Mesh, startNodeIndex: number, count: number, instances: InstanceDataView | null = null): void {
    const connection = this._connection;

    if (!connection) {
      throw new Error('WebGl2MeshRenderer is not connected to a backend.');
    }

    if (count <= 0 || mesh.vertexCount === 0) {
      return;
    }

    const geometry = mesh.geometry;

    if (geometry === null) {
      throw new Error('drawInstancedBatch requires a mesh constructed from a geometry.');
    }

    const backend = this.getBackend();
    const material = mesh.material;
    const shader = material === null ? this._defaultShader : this._getOrCreateCustomShader(material, connection.gl);

    // A batch reads its per-instance transform from the shared buffer via
    // a_nodeIndex; a shader that does not follow that contract has no other way
    // to reach it. The node path can quietly fall back to the legacy per-draw
    // shader here (one node is one draw either way) - a batch cannot, because
    // the fallback would turn a single instanced draw into `count` draw calls
    // and only ever surface in a profiler.
    if (material !== null && !this._isInstancingCompatible(shader)) {
      throw new Error(`RenderBatch material shader is not instancing-compatible: ${this._describeInstancingGap(shader)}.`);
    }

    // Neither a custom material nor mutable geometry is recordable: the recorded
    // byte stream replays through the default shader, and a re-packed buffer is
    // not the stable, persistent one a retained batch references. If either
    // arrives inside an open capture, poison it so the group's set never
    // validates and it degrades to entry replay instead of wrong pixels -
    // mirroring the sprite renderer's custom-material poison and
    // _drawDynamicInstancedSingle's dynamic-geometry poison.
    if ((material !== null || geometry.usage !== 'static') && backend._isRetainedCapturing) {
      backend._poisonRetainedCaptures();
    }

    // The material owns its blend mode; the mesh's own blendMode overrides it
    // when set away from the default (Normal) - same rule as the node path.
    const blendMode = material !== null && mesh.blendMode === BlendModes.Normal ? material.blendMode : mesh.blendMode;
    const texture = mesh.texture ?? Texture.white;
    const cacheEntry = this._getOrCreateGeometryEntry(geometry, mesh, connection);
    const vao = this._getOrCreateStaticGeometryVao(
      cacheEntry,
      shader,
      connection.gl,
      connection.dynamicNodeIndexBuffer,
      instances,
      connection.dynamicInstanceBuffer,
    );

    backend.setBlendMode(blendMode);
    this._ensureNodeIndexCapacity(count);

    const maxNodeIndex = (startNodeIndex + count - 1) >>> 0;

    for (let i = 0; i < count; i++) {
      this._nodeIndexData[i] = (startNodeIndex + i) >>> 0;
    }

    this._bindInstancedShaderState(shader, texture, material, backend, maxNodeIndex);
    backend.bindVertexArrayObject(vao);
    connection.dynamicNodeIndexBuffer.upload(this._nodeIndexData, 0, count);

    if (instances !== null) {
      // Upload exactly the packed instances, not the batch's whole (over-grown)
      // storage - the VAO reads `count` strides from offset 0.
      connection.dynamicInstanceBuffer.upload(instances.data, 0, count * instances.strideFloats);
    }

    this._bindBaseTextureSampler(backend, material);
    vao.drawInstanced(cacheEntry.indexCount, 0, count, RenderingPrimitives.Triangles);
    this._unbindBaseTextureSampler(backend, material);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const connection = this._connection;
    const count = this._pendingCount;

    if (backend === null || connection === null || count === 0) {
      this._pendingCount = 0;
      return;
    }

    for (let i = 0; i < count; i++) {
      // In-bounds: `i` ranges over `0..count-1` (pool slots filled by render()).
      const draw = this._pendingDraws[i]!;

      if (this._canBatchStatic(draw)) {
        let end = i + 1;

        // In-bounds: `end` and `end - 1` stay within `0..count-1` per the loop guard.
        while (end < count && this._isSameBatch(this._pendingDraws[end - 1]!, this._pendingDraws[end]!)) {
          end++;
        }

        if (end - i >= 2) {
          this._drawStaticBatch(i, end, backend, connection);
          i = end - 1;
          continue;
        }
      }

      this._drawSingle(i, backend, connection);
    }

    // Reset only the cursor; pooled slots stay allocated for the next frame.
    this._pendingCount = 0;
  }

  public destroy(): void {
    this.disconnect();
    this._defaultShader.destroy();
    for (const shader of this._customShaders.values()) {
      shader.destroy();
    }
    this._customShaders.clear();
    this._compatibilityCache.clear();
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    this._defaultShader.connect(createWebGl2ShaderProgram(gl));
    this._defaultShader.sync();

    // Custom shaders compiled before connect() get connected here too.
    for (const customShader of this._customShaders.values()) {
      customShader.connect(createWebGl2ShaderProgram(gl));
      customShader.sync();
    }

    const buffers = new Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>();
    const dynamicIndexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, this._indexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );
    const dynamicVertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );
    const dynamicNodeIndexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._nodeIndexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );
    const dynamicInstanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._instanceAttributeData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, buffers),
      backend.accountant,
    );

    const dynamicVaoHandle = gl.createVertexArray();

    if (dynamicVaoHandle === null) {
      throw new Error('Could not create vertex array object.');
    }

    const dynamicVao = new WebGl2VertexArrayObject()
      .addIndex(dynamicIndexBuffer)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(dynamicVertexBuffer, this._defaultShader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
      .addAttribute(dynamicNodeIndexBuffer, this._defaultShader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, 0, true, 1)
      .connect(this._createVaoRuntime(gl, dynamicVaoHandle));

    this._connection = {
      gl,
      buffers,
      dynamicVao,
      dynamicVertexBuffer,
      dynamicIndexBuffer,
      dynamicNodeIndexBuffer,
      dynamicInstanceBuffer,
    };
  }

  protected onDisconnect(): void {
    const connection = this._connection;

    if (!connection) {
      return;
    }

    this._defaultShader.disconnect();
    for (const customShader of this._customShaders.values()) {
      customShader.disconnect();
    }

    for (const entry of this._geometryCache.values()) {
      for (const perLayout of entry.vaos.values()) {
        for (const vao of perLayout.values()) {
          vao.destroy();
        }
      }

      entry.vaos.clear();
      entry.indexBuffer.destroy();
      entry.vertexBuffer.destroy();
    }

    this._geometryCache.clear();
    connection.dynamicNodeIndexBuffer.destroy();
    connection.dynamicIndexBuffer.destroy();
    connection.dynamicVertexBuffer.destroy();
    connection.dynamicVao.destroy();

    this._connection = null;
    this._pendingDraws.length = 0;
    this._pendingCount = 0;
  }

  private _drawSingle(index: number, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    // In-bounds: callers pass an index in `0..count-1`.
    const draw = this._pendingDraws[index]!;

    if (this._canBatchStatic(draw)) {
      this._drawStaticBatch(index, index + 1, backend, connection);
      return;
    }

    if (draw.supportsInstancing && draw.material === null) {
      this._drawDynamicInstancedSingle(draw, backend, connection);
      return;
    }

    this._drawLegacyImmediate(draw, backend, connection);
  }

  private _drawDynamicInstancedSingle(draw: PendingMeshDraw, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    // A dynamic-geometry (non-static) mesh cannot be recorded - its geometry is
    // not the shared, persistent buffer a retained batch references, which is
    // why _admitsRetainedRecording keeps such a mesh from ever opening a
    // capture. A mesh's geometry cannot change after that verdict was cached
    // (see _admitsRetainedRecording), so this poison is unreachable through the
    // public API and stays only as a structural safety net.
    if (backend._isRetainedCapturing) {
      backend._poisonRetainedCaptures();
    }

    const nodeIndex = draw.command?.nodeIndex ?? 0;

    if (draw.command === null) {
      // The synthetic, non-plan path does not arrive through a render-group
      // upload boundary, so write its transform into the shared buffer directly.
      // This must run BEFORE _bindInstancedShaderState, whose
      // bindTransformBufferTexture uploads the buffer: a write afterwards would
      // miss this frame's upload, leaving the slot stale (zeroed on the first
      // frame) so the draw collapses to the origin.
      backend._writeTransformCommand(this._createSyntheticCommand(draw.mesh, nodeIndex));
    }

    backend.setBlendMode(draw.blendMode);
    this._bindInstancedShaderState(draw.shader, draw.texture, draw.material, backend, nodeIndex);

    const indexFormat = draw.mesh.indexFormat;

    this._ensureVertexCapacity(draw.mesh.vertexCount);
    this._ensureIndexCapacity(draw.mesh.indexCount, indexFormat);
    this._ensureNodeIndexCapacity(1);

    const indexScratch = this._indexScratch(indexFormat);

    this._packVertices(draw.mesh, 0);
    this._packIndices(draw.mesh, 0, indexScratch);

    this._nodeIndexData[0] = nodeIndex >>> 0;

    connection.dynamicVao.setIndexType(glIndexType(indexFormat));
    backend.bindVertexArrayObject(connection.dynamicVao);
    connection.dynamicVertexBuffer.upload(this._float32View, 0, draw.mesh.vertexCount * vertexStrideWords);
    connection.dynamicIndexBuffer.upload(indexScratch, 0, draw.mesh.indexCount);
    connection.dynamicNodeIndexBuffer.upload(this._nodeIndexData, 0, 1);
    connection.dynamicVao.drawInstanced(draw.mesh.indexCount, 0, 1, RenderingPrimitives.Triangles);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /**
   * Draw the pooled pending-draws in the half-open range `[start, end)` as one
   * instanced batch. Callers (flush single-draw and run-batching) guarantee
   * `end > start` and that every slot in the range shares geometry/shader/
   * material/blend/texture (see {@link _isSameBatch}). Iterating the range
   * in place avoids the per-batch array copy a `slice()` would allocate.
   */
  private _drawStaticBatch(start: number, end: number, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    // In-bounds: `start < end <= _pendingCount`, so `start` is a filled slot.
    const first = this._pendingDraws[start]!;
    const geometry = first.mesh.geometry!;
    const count = end - start;
    const cacheEntry = this._getOrCreateGeometryEntry(geometry, first.mesh, connection);
    const vao = this._getOrCreateStaticGeometryVao(cacheEntry, first.shader, connection.gl, connection.dynamicNodeIndexBuffer);

    backend.setBlendMode(first.blendMode);

    let maxNodeIndex = 0;

    this._ensureNodeIndexCapacity(count);

    for (let i = 0; i < count; i++) {
      // In-bounds: `start + i` ranges over `[start, end)`, all filled slots.
      const command = this._pendingDraws[start + i]!.command!;
      const nodeIndex = command.nodeIndex >>> 0;

      this._nodeIndexData[i] = nodeIndex;

      if (nodeIndex > maxNodeIndex) {
        maxNodeIndex = nodeIndex;
      }
    }

    this._bindInstancedShaderState(first.shader, first.texture, first.material, backend, maxNodeIndex);
    backend.bindVertexArrayObject(vao);
    connection.dynamicNodeIndexBuffer.upload(this._nodeIndexData, 0, count);
    this._bindBaseTextureSampler(backend, first.material);
    vao.drawInstanced(cacheEntry.indexCount, 0, count, RenderingPrimitives.Triangles);
    this._unbindBaseTextureSampler(backend, first.material);

    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Retained recording (mesh opt-in): while a capture window
    // is open, hand this flush's per-instance node-index stream and a reference
    // to the SHARED, persistent geometry to the backend. The geometry
    // (vertex+index buffers) is NOT copied into the group bundle - only the
    // node-index words are group-owned. `cacheEntry` is structurally a
    // WebGl2RetainedGeometryRef (vertexBuffer/indexBuffer/indexCount).
    if (backend._isRetainedCapturing) {
      this._retainedTextureScratch[0] = first.texture;
      backend.recordRetainedBatch(this, this._nodeIndexData.subarray(0, count), count, first.blendMode, this._retainedTextureScratch, 1, cacheEntry);
    }
  }

  private _drawLegacyImmediate(draw: PendingMeshDraw, backend: WebGl2Backend, connection: MeshRendererConnection): void {
    const mesh = draw.mesh;
    const shader = draw.shader;

    backend.setBlendMode(draw.blendMode);

    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
    }

    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }

    backend.stageViewportUniform(shader);

    if (shader.uniforms.has('u_translation')) {
      // Invariant: a custom mesh vertex shader must not declare BOTH `u_group`
      // and consume `u_translation` - that would apply the group transform
      // twice (once staged as `u_group`, once folded in here). This CPU-side
      // compose is the fallback for shaders WITHOUT `u_group`.
      const groupTransform = backend.renderGroupTransform;
      const translation =
        groupTransform !== null ? this._groupComposeScratch.copy(mesh.getGlobalTransform()).combine(groupTransform) : mesh.getGlobalTransform();

      shader.getUniform('u_translation').setValue(translation.toArray(false));
    }

    if (shader.uniforms.has('u_tint')) {
      shader.getUniform('u_tint').setValue(mesh.tint.toArray(false));
    }

    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      backend.bindTexture(draw.texture, 0);
    }

    if (draw.material !== null) {
      this._bindCustomUniforms(shader, draw.material, backend);
    }

    const indexFormat = mesh.indexFormat;

    this._ensureVertexCapacity(mesh.vertexCount);
    this._ensureIndexCapacity(mesh.indexCount, indexFormat);

    const indexScratch = this._indexScratch(indexFormat);

    this._packVertices(mesh, 0);
    this._packIndices(mesh, 0, indexScratch);

    shader.sync();
    connection.dynamicVao.setIndexType(glIndexType(indexFormat));
    backend.bindVertexArrayObject(connection.dynamicVao);
    connection.dynamicVertexBuffer.upload(this._float32View, 0, mesh.vertexCount * vertexStrideWords);
    connection.dynamicIndexBuffer.upload(indexScratch, 0, mesh.indexCount);
    this._bindBaseTextureSampler(backend, draw.material);
    connection.dynamicVao.draw(mesh.indexCount, 0, RenderingPrimitives.Triangles);
    this._unbindBaseTextureSampler(backend, draw.material);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _bindInstancedShaderState(
    shader: Shader,
    texture: Texture | RenderTexture,
    material: Material | null,
    backend: WebGl2Backend,
    maxNodeIndex: number,
  ): void {
    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
    }

    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }

    backend.stageViewportUniform(shader);

    if (shader.uniforms.has('u_transforms')) {
      backend.bindTransformBufferTexture(transformTextureUnit, maxNodeIndex + 1);
      shader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    }

    if (shader.uniforms.has('u_tintTexture')) {
      backend.bindTintBufferTexture(transformTintTextureUnit);
      shader.getUniform('u_tintTexture').setValue(this._tintUnitScratch);
    }

    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      backend.bindTexture(texture, 0);
    }

    if (material !== null) {
      this._bindCustomUniforms(shader, material, backend);
    }

    shader.sync();
  }

  private _bindBaseTextureSampler(backend: WebGl2Backend, material: Material | null): void {
    if (material?.sampler !== null && material?.sampler !== undefined) {
      backend.bindMaterialSampler(material.sampler, 0);
    }
  }

  private _unbindBaseTextureSampler(backend: WebGl2Backend, material: Material | null): void {
    if (material?.sampler !== null && material?.sampler !== undefined) {
      backend.unbindMaterialSampler(0);
    }
  }

  // ── Retained-batch record/replay (mesh opt-in) ────────────────────────────
  // Mesh's recordable draw is an INDEXED instanced draw: shared per-Geometry
  // vertex+index buffers (referenced via `payload.geometry`, never copied into
  // the group bundle) plus a group-owned per-instance node-index stream (one
  // u32/instance in the bundle instance buffer). Only the node-index words are
  // group-local, so the layout-aware scan/rebase read word 0 of each 1-word
  // instance - the mesh counterpart of the sprite's word-7-of-8 layout.

  /** @internal See {@link WebGl2RetainedBatchReplayer.scanRetainedNodeIndexRange}. */
  public scanRetainedNodeIndexRange(payload: WebGl2RetainedBatchPayload, range: WebGl2RetainedNodeIndexRange): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      // In-bounds: the payload's node-index words were appended to the store.
      const node = words[start + i]!;

      if (node < range.min) {
        range.min = node;
      }

      if (node > range.max) {
        range.max = node;
      }
    }
  }

  /** @internal See {@link WebGl2RetainedBatchReplayer.rebaseRetainedNodeIndices} (rebases to group-local indices). */
  public rebaseRetainedNodeIndices(payload: WebGl2RetainedBatchPayload, base: number): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      const index = start + i;

      // In-bounds: see the scan above.
      words[index] = (words[index]! - base) >>> 0;
    }
  }

  /**
   * Wire the batch VAO: per-vertex geometry attributes from the SHARED,
   * persistent geometry buffers ({@link WebGl2RetainedBatchPayload.geometry}),
   * that geometry's index buffer, and the per-instance node-index attribute
   * from the group bundle's instance buffer based at `payload.byteOffset`
   * (WebGL2 has no baseInstance). Same attribute set/locations as the live
   * static-batch VAO in {@link _getOrCreateStaticGeometryVao}.
   * @internal
   */
  public configureRetainedVao(payload: WebGl2RetainedBatchPayload): void {
    const gl = this.getBackend().context;
    const geometry = payload.geometry;
    const instanceBuffer = payload.bundle.instanceBuffer;
    const vao = payload.vao;

    if (geometry === null || geometry === undefined || instanceBuffer === null || vao === null) {
      throw new Error('WebGl2MeshRenderer: retained batch VAO configuration requires geometry and an uploaded bundle.');
    }

    const shader = this._defaultShader;

    vao
      .addIndex(geometry.indexBuffer, glIndexType(geometry.indexFormat))
      .addAttribute(geometry.vertexBuffer, shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(geometry.vertexBuffer, shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .addAttribute(geometry.vertexBuffer, shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, vertexStrideBytes, 16)
      .addAttribute(instanceBuffer, shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, payload.byteOffset, true, 1);
  }

  /**
   * Replay one recorded default-path mesh batch: all STATE is resolved live -
   * blend mode, `u_projection` from the live view, `u_group` from the live
   * composed group matrix (the camera-pan / group-move win), the texture - and
   * only DATA is cached: the SHARED geometry (vertex+index buffers), the
   * group-owned node-index stream (through the per-batch VAO), and the
   * group-owned transform texture on the shared transform unit. Drawn indexed
   * (`drawElementsInstanced`), unlike the sprite path's `drawArraysInstanced`.
   * @internal
   */
  public replayRetainedBatch(payload: WebGl2RetainedBatchPayload): void {
    const backend = this.getBackendOrNull();
    const vao = payload.vao;
    const geometry = payload.geometry;
    const transformTexture = payload.bundle.transformTexture;
    const tintTexture = payload.bundle.tintTexture;

    if (backend === null || vao === null || geometry === null || geometry === undefined || transformTexture === null || tintTexture === null) {
      // Defensive: a bundle in this state never validates (generation), so a
      // spliced replay cannot reach here; skip rather than crash mid-frame.
      return;
    }

    const shader = this._defaultShader;

    backend.setBlendMode(payload.blendMode);

    if (shader.uniforms.has('u_projection')) {
      shader.getUniform('u_projection').setValue(backend.view.getTransform().toArray(false));
    }

    if (shader.uniforms.has('u_group')) {
      const groupTransform = backend.renderGroupTransform;

      shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }

    backend.stageViewportUniform(shader);

    if (shader.uniforms.has('u_texture')) {
      shader.getUniform('u_texture').setValue(this._textureUnitScratch);
      // In-bounds: mesh batches record exactly one texture slot.
      backend.bindTexture(payload.textures[0]!, 0);
    }

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
    vao.drawInstanced(geometry.indexCount, 0, payload.instanceCount, RenderingPrimitives.Triangles);
  }

  private _canBatchStatic(draw: PendingMeshDraw): boolean {
    if (!draw.supportsInstancing) {
      return false;
    }

    if (draw.command?.groupIndex === undefined) {
      return false;
    }

    const geometry = draw.mesh.geometry;

    return geometry?.usage === 'static';
  }

  private _isSameBatch(left: PendingMeshDraw, right: PendingMeshDraw): boolean {
    if (!this._canBatchStatic(left) || !this._canBatchStatic(right)) {
      return false;
    }

    return (
      left.command!.groupIndex === right.command!.groupIndex &&
      left.mesh.geometry === right.mesh.geometry &&
      left.shader === right.shader &&
      left.material === right.material &&
      left.blendMode === right.blendMode &&
      left.texture === right.texture &&
      left.command!.material.pipelineKey === right.command!.material.pipelineKey &&
      left.command!.material.bindKey === right.command!.material.bindKey
    );
  }

  private _isInstancingCompatible(shader: Shader): boolean {
    const cached = this._compatibilityCache.get(shader);

    if (cached !== undefined) {
      return cached;
    }

    const compatible =
      shader.attributes.has('a_nodeIndex') && shader.uniforms.has('u_transforms') && !shader.uniforms.has('u_translation') && !shader.uniforms.has('u_tint');

    this._compatibilityCache.set(shader, compatible);

    return compatible;
  }

  // Cold path: only runs when a batch is about to throw, so it re-derives the
  // individual conditions of _isInstancingCompatible rather than caching them.
  // Reflection reports the LINKED program, so a declared-but-unread uniform is
  // legitimately absent here - such a shader really cannot be instanced.
  private _describeInstancingGap(shader: Shader): string {
    const gaps: string[] = [];

    if (!shader.attributes.has('a_nodeIndex')) {
      gaps.push('missing attribute `a_nodeIndex`');
    }

    if (!shader.uniforms.has('u_transforms')) {
      gaps.push('missing uniform `u_transforms`');
    }

    if (shader.uniforms.has('u_translation')) {
      gaps.push('declares the single-draw uniform `u_translation`');
    }

    if (shader.uniforms.has('u_tint')) {
      gaps.push('declares the single-draw uniform `u_tint`');
    }

    return `${gaps.join(', ')} — include INSTANCE_TRANSFORM_GLSL and position via exoInstanceClipPosition()`;
  }

  private _getOrCreateGeometryEntry(geometry: Geometry, mesh: Mesh, connection: MeshRendererConnection): GeometryCacheEntry {
    const existing = this._geometryCache.get(geometry);

    if (existing !== undefined) {
      if (existing.version !== geometry.version) {
        this._repackGeometryEntry(existing, mesh);
      }

      return existing;
    }

    const vertexCount = mesh.vertexCount;
    const indexCount = mesh.indexCount;
    const interleaved = new ArrayBuffer(vertexCount * vertexStrideBytes);
    const floatView = new Float32Array(interleaved);
    const uintView = new Uint32Array(interleaved);

    this._packVertices(mesh, 0, floatView, uintView);

    const indexFormat = mesh.indexFormat;
    const indexData = createIndexArray(indexFormat, indexCount);

    this._packIndices(mesh, 0, indexData);

    const accountant = this.getBackend().accountant;
    // Non-static geometry is re-uploaded whenever its version moves, so the
    // driver is told to expect repeated writes to the same buffer object.
    const bufferUsage = geometry.usage === 'static' ? BufferUsage.StaticDraw : BufferUsage.DynamicDraw;
    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, floatView, bufferUsage).connect(
      this._createBufferRuntime(connection.gl, connection.buffers),
      accountant,
    );
    const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, indexData, bufferUsage).connect(
      this._createBufferRuntime(connection.gl, connection.buffers),
      accountant,
    );

    vertexBuffer.upload(floatView);
    indexBuffer.upload(indexData);

    const disposeListener = (): void => {
      const entry = this._geometryCache.get(geometry);

      if (entry === undefined) {
        return;
      }

      for (const perLayout of entry.vaos.values()) {
        for (const vao of perLayout.values()) {
          vao.destroy();
        }
      }

      entry.vaos.clear();
      entry.indexBuffer.destroy();
      entry.vertexBuffer.destroy();
      this._geometryCache.delete(geometry);
    };

    geometry._onDispose(disposeListener);

    const created: GeometryCacheEntry = {
      geometry,
      vertexBuffer,
      indexBuffer,
      vaos: new Map(),
      disposeListener,
      indexCount,
      indexFormat,
      version: geometry.version,
    };

    this._geometryCache.set(geometry, created);

    return created;
  }

  /**
   * Re-pack and re-upload a cached entry whose geometry has been mutated and
   * {@link Geometry.invalidate}d. The `WebGl2RenderBuffer` objects are reused
   * rather than recreated, so every VAO already cached against this entry stays
   * valid and no VAO rebuild is needed.
   */
  private _repackGeometryEntry(entry: GeometryCacheEntry, mesh: Mesh): void {
    const vertexCount = mesh.vertexCount;
    const indexCount = mesh.indexCount;
    const interleaved = new ArrayBuffer(vertexCount * vertexStrideBytes);
    const floatView = new Float32Array(interleaved);
    const uintView = new Uint32Array(interleaved);

    this._packVertices(mesh, 0, floatView, uintView);

    const indexData = createIndexArray(mesh.indexFormat, indexCount);

    this._packIndices(mesh, 0, indexData);

    entry.vertexBuffer.upload(floatView);
    entry.indexBuffer.upload(indexData);
    entry.indexCount = indexCount;
    // A re-pack may cross the 16-bit ceiling in either direction, and every VAO
    // cached against this entry draws with the type set at its creation - so a
    // changed width has to be pushed onto all of them, not just recorded here.
    if (entry.indexFormat !== mesh.indexFormat) {
      entry.indexFormat = mesh.indexFormat;

      for (const perLayout of entry.vaos.values()) {
        for (const vao of perLayout.values()) {
          vao.setIndexType(glIndexType(mesh.indexFormat));
        }
      }
    }

    entry.version = entry.geometry.version;
  }

  private _getOrCreateStaticGeometryVao(
    entry: GeometryCacheEntry,
    shader: Shader,
    gl: WebGL2RenderingContext,
    nodeIndexBuffer: WebGl2RenderBuffer,
    instances: InstanceDataView | null = null,
    instanceBuffer: WebGl2RenderBuffer | null = null,
  ): WebGl2VertexArrayObject {
    // The divisor-1 free-attribute layout is a property of the BATCH, not of the
    // geometry or the shader, so two batches sharing both still need separate
    // VAOs when their layouts differ - hence the second cache level.
    const layoutKey = instances?.layoutKey ?? '';
    let perLayout = entry.vaos.get(shader);

    if (perLayout === undefined) {
      perLayout = new Map();
      entry.vaos.set(shader, perLayout);
    }

    const existing = perLayout.get(layoutKey);

    if (existing !== undefined) {
      return existing;
    }

    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('Could not create vertex array object.');
    }

    // a_nodeIndex is mandatory - it is how any instanced draw reaches its
    // transform, and _isInstancingCompatible already rejects a custom shader
    // without it. The three geometry attributes are optional: GL strips
    // declared-but-unread inputs at link time, so a custom batch shader that
    // ignores texcoords or vertex colors simply has no such attribute to bind.
    // Skipping those keeps the interleaved layout's offsets untouched.
    const vao = new WebGl2VertexArrayObject().addIndex(entry.indexBuffer, glIndexType(entry.indexFormat));
    const geometryAttributes = [
      { name: 'a_position', type: gl.FLOAT, normalized: false, offset: 0 },
      { name: 'a_texcoord', type: gl.FLOAT, normalized: false, offset: 8 },
      { name: 'a_color', type: gl.UNSIGNED_BYTE, normalized: true, offset: 16 },
    ] as const;

    for (const { name, type, normalized, offset } of geometryAttributes) {
      const attribute = shader.attributes.get(name);

      if (attribute !== undefined) {
        vao.addAttribute(entry.vertexBuffer, attribute, type, normalized, vertexStrideBytes, offset);
      }
    }

    vao.addAttribute(nodeIndexBuffer, shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, Uint32Array.BYTES_PER_ELEMENT, 0, true, 1);

    if (instances !== null && instanceBuffer !== null) {
      const strideBytes = instances.strideFloats * Float32Array.BYTES_PER_ELEMENT;

      for (const binding of instances.attributes) {
        // Bound by name, like every other attribute here - a declared attribute
        // the linked program dropped is a mistake worth reporting, since the
        // caller explicitly asked for it.
        const attribute = shader.attributes.get(binding.name);

        if (attribute === undefined) {
          throw new Error(`RenderBatch instance attribute '${binding.name}' is not present in the material's linked shader.`);
        }

        vao.addAttribute(instanceBuffer, attribute, gl.FLOAT, false, strideBytes, binding.offsetFloats * Float32Array.BYTES_PER_ELEMENT, false, 1);
      }
    }

    vao.connect(this._createVaoRuntime(gl, vaoHandle));
    perLayout.set(layoutKey, vao);

    return vao;
  }

  private _packVertices(mesh: Mesh, vertexStart: number, floatView: Float32Array = this._float32View, uintView: Uint32Array = this._uint32View): void {
    const positions = mesh.vertices;
    const uvs = mesh.uvs;
    const colors = mesh.colors;
    const vertexCount = mesh.vertexCount;

    for (let i = 0; i < vertexCount; i++) {
      const word = (vertexStart + i) * vertexStrideWords;
      const pair = i * 2;

      // In-bounds: `pair + 1 < vertices.length` (vertexCount = vertices.length / 2);
      // `uvs`/`colors` lengths were validated against the vertex data on construction.
      floatView[word] = positions[pair]!;
      floatView[word + 1] = positions[pair + 1]!;

      if (uvs !== null) {
        floatView[word + 2] = uvs[pair]!;
        floatView[word + 3] = uvs[pair + 1]!;
      } else {
        floatView[word + 2] = 0;
        floatView[word + 3] = 0;
      }

      uintView[word + 4] = colors !== null ? colors[i]! : defaultVertexColor;
    }
  }

  private _packIndices(mesh: Mesh, indexStart: number, target: MeshIndexArray): void {
    const indexCount = mesh.indexCount;

    if (mesh.indices !== null) {
      target.set(mesh.indices, indexStart);
      return;
    }

    for (let i = 0; i < indexCount; i++) {
      target[indexStart + i] = i;
    }
  }

  private _ensureVertexCapacity(vertexCount: number): void {
    if (vertexCount <= this._vertexCapacity) {
      return;
    }

    while (this._vertexCapacity < vertexCount) {
      this._vertexCapacity *= 2;
    }

    this._vertexData = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
    this._float32View = new Float32Array(this._vertexData);
    this._uint32View = new Uint32Array(this._vertexData);
  }

  private _ensureIndexCapacity(indexCount: number, format: MeshIndexFormat): void {
    if (indexCount > this._indexCapacity) {
      while (this._indexCapacity < indexCount) {
        this._indexCapacity *= 2;
      }

      this._indexData = new Uint16Array(this._indexCapacity);
      this._indexData32 = this._indexData32.length === 0 ? this._indexData32 : new Uint32Array(this._indexCapacity);
    }

    if (format === 'uint32' && this._indexData32.length < this._indexCapacity) {
      this._indexData32 = new Uint32Array(this._indexCapacity);
    }
  }

  /** The staging array a draw of `format` packs into. */
  private _indexScratch(format: MeshIndexFormat): MeshIndexArray {
    return format === 'uint32' ? this._indexData32 : this._indexData;
  }

  private _ensureNodeIndexCapacity(instanceCount: number): void {
    if (instanceCount <= this._nodeIndexCapacity) {
      return;
    }

    while (this._nodeIndexCapacity < instanceCount) {
      this._nodeIndexCapacity *= 2;
    }

    this._nodeIndexData = new Uint32Array(this._nodeIndexCapacity);
  }

  private _createBufferRuntime(
    gl: WebGL2RenderingContext,
    buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>,
  ): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('Could not create render buffer.');
    }

    return {
      bind: (buffer: WebGl2RenderBuffer): void => {
        gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer: WebGl2RenderBuffer, offset: number): void => {
        const state = buffers.get(buffer);
        gl.bindBuffer(buffer.type, handle);

        if (state && state.dataByteLength >= buffer.uploadByteLength) {
          uploadBufferRange(gl, buffer, offset);
          state.dataByteLength = buffer.uploadByteLength;
        } else {
          uploadBufferStore(gl, buffer);
          buffers.set(buffer, { handle, dataByteLength: buffer.uploadByteLength });
        }
      },
      destroy: (buffer: WebGl2RenderBuffer): void => {
        gl.deleteBuffer(handle);
        buffers.delete(buffer);
        buffer.disconnect();
      },
    };
  }

  private _createVaoRuntime(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject): WebGl2VertexArrayObjectRuntime {
    let appliedVersion = -1;

    return {
      bind: (vao: WebGl2VertexArrayObject): void => {
        gl.bindVertexArray(vaoHandle);

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

          if (vao.indexBuffer) {
            vao.indexBuffer.bind();
          }

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (vao: WebGl2VertexArrayObject, size: number, start: number, type: number): void => {
        if (vao.indexBuffer) {
          gl.drawElements(type, size, vao.indexType, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      drawInstanced: (vao: WebGl2VertexArrayObject, count: number, start: number, instanceCount: number, type: number): void => {
        if (vao.indexBuffer) {
          gl.drawElementsInstanced(type, count, vao.indexType, start, instanceCount);
        } else {
          gl.drawArraysInstanced(type, start, count, instanceCount);
        }
      },
      destroy: (vao: WebGl2VertexArrayObject): void => {
        gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }

  private _getOrCreateCustomShader(material: Material, gl: WebGL2RenderingContext): Shader {
    const cached = this._customShaders.get(material);
    if (cached !== undefined) {
      return cached;
    }

    const glsl = material.shader.glsl;

    if (glsl === null) {
      throw new Error('Mesh material shader has no `glsl` source; cannot render through the WebGL2 backend.');
    }

    if (glsl.vertex === null) {
      throw new Error('Mesh material shader has no GLSL vertex stage; only sprite materials and shader filters may omit it.');
    }

    const shader = new Shader(glsl.vertex, glsl.fragment);
    shader.connect(createWebGl2ShaderProgram(gl));
    // Force first finalize so getUniform()/uniforms.has() are usable below.
    shader.sync();

    this._customShaders.set(material, shader);

    // Wire material.destroy() through to evict + dispose the cached program.
    material.onDispose(() => {
      const stored = this._customShaders.get(material);
      if (stored !== undefined) {
        stored.destroy();
        this._customShaders.delete(material);
      }
    });

    return shader;
  }

  private _bindCustomUniforms(shader: Shader, material: Material, backend: WebGl2Backend): void {
    // Texture bindings take consecutive slots starting at 1 (slot 0 belongs to
    // the mesh's own `u_texture`). Texture-valued uniforms bind first, then the
    // entries of the material's dedicated `textures` map.
    for (const name of material._bindingSchema.scalarUniformNames) {
      if (shader.uniforms.has(name)) {
        shader.getUniform(name).setValue(this._marshalUniformValue(material._getUniformValue(name) as Exclude<UniformValue, Texture | RenderTexture>));
      }
    }

    let textureSlot = 1;

    for (const name of material._bindingSchema.textureUniformNames) {
      textureSlot = this._bindCustomTexture(shader, name, material._getUniformValue(name) as Texture | RenderTexture, textureSlot, backend);
    }

    for (const name of material._bindingSchema.textureNames) {
      textureSlot = this._bindCustomTexture(shader, name, material._getTextureValue(name), textureSlot, backend);
    }
  }

  private _bindCustomTexture(shader: Shader, name: string, texture: Texture | RenderTexture, textureSlot: number, backend: WebGl2Backend): number {
    if (textureSlot >= maxCustomTextureSlots) {
      throw new Error(`Mesh material requested more than ${maxCustomTextureSlots - 1} texture bindings.`);
    }

    if (shader.uniforms.has(name)) {
      backend.bindTexture(texture, textureSlot);
      shader.getUniform(name).setValue(this._slotScratches[textureSlot]!);
    }

    return textureSlot + 1;
  }

  private _marshalUniformValue(value: Exclude<UniformValue, Texture | RenderTexture>): Float32Array | Int32Array {
    if (value instanceof Float32Array || value instanceof Int32Array) {
      return value;
    }
    if (typeof value === 'number') {
      return new Float32Array([value]);
    }
    // readonly tuple [a, b], [a, b, c], [a, b, c, d]
    return new Float32Array(value as readonly number[]);
  }

  private _createSyntheticCommand(mesh: Mesh, nodeIndex: number): DrawCommand {
    return {
      kind: RenderEntryKind.Draw,
      drawable: mesh,
      nodeIndex,
      seq: 0,
      zIndex: mesh.zIndex,
      material: {
        rendererId: 0,
        blendMode: mesh.blendMode,
        textureId: -1,
        shaderId: -1,
        pipelineKey: 0,
        bindKey: 0,
        ownMaterial: false,
      },
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      groupIndex: 0,
    };
  }
}
