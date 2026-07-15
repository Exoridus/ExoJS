import type {
  RenderTexture,
  Texture,
  View,
  WebGl2Backend,
  WebGl2RenderBufferRuntime,
  WebGl2RetainedBatchPayload,
  WebGl2RetainedBatchReplayer,
  WebGl2RetainedNodeIndexRange,
  WebGl2VertexArrayObjectRuntime,
} from '@codexo/exojs/renderer-sdk';
import {
  AbstractWebGl2Renderer,
  BlendModes,
  BufferTypes,
  BufferUsage,
  createWebGl2ShaderProgram,
  RenderingPrimitives,
  Shader,
  WebGl2RenderBuffer,
  WebGl2VertexArrayObject,
} from '@codexo/exojs/renderer-sdk';

import type { TileQuad } from '../chunkGeometry';
import type { TileChunkNode } from '../TileChunkNode';

// One instance = one tile quad. Layout matches the engine's instanced-quad
// convention (NineSlice/Repeating): float32x4 local rect, unorm16x4 UV bounds,
// unorm8x4 tint, uint32 tile word (transform row + diagonal bit).
const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const transformTextureUnit = 1;
const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

// Tile word packing: transform-buffer row in the low 29 bits, diagonal flip in
// bit 29. flipX/flipY are baked into the UV bounds at write time; the shader
// only needs the diagonal axis swap.
const TILE_ROW_MASK = 0x1fffffff;
const TILE_DIAGONAL_BIT = 0x20000000;

const tileVertexSource = `#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (divisor = 1). One entry per tile quad.
// gl_VertexID 0..3 selects which corner of the quad this invocation computes.
layout(location = 0) in vec4 a_quadBounds;   // x0, y0, x1, y1 (chunk-local)
layout(location = 1) in vec4 a_uvBounds;     // uMin, vMin, uMax, vMax (flipX/Y + texture flipY baked)
layout(location = 2) in vec4 a_color;        // RGBA tint (layer opacity in alpha)
layout(location = 3) in uint a_tileWord;     // transform row (bits 0..28) | diagonal (bit 29)

uniform mat3 u_projection;
uniform mat3 u_group;
uniform sampler2D u_transforms;              // shared per-frame transform buffer (2 texels/row)

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    // gl_VertexID 0..3 -> corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_quadBounds.x : a_quadBounds.z;
    float localY = (cornerY == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_tileWord & ${TILE_ROW_MASK}u);
    bool diagonal = (a_tileWord & ${TILE_DIAGONAL_BIT}u) != 0u;

    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0); // tx, ty, 0, 0

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    gl_Position = vec4((u_projection * u_group * vec3(worldX, worldY, 1.0)).xy, 0.0, 1.0);

    // Tile orientation: the diagonal flip transposes the corner-coordinate axes
    // before the UV corner is selected; flipX/flipY are already baked into the
    // (uMin,uMax)/(vMin,vMax) ordering by the CPU writer.
    int su = cornerX;
    int sv = cornerY;
    if (diagonal) { int t = su; su = sv; sv = t; }

    float u = (su == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (sv == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}`;

const tileFragmentSource = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 sampleColor = texture(u_texture, v_texcoord);
    fragColor = sampleColor * v_color;
}`;

interface TileRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vaoHandle: WebGLVertexArrayObject;
}

/**
 * Instanced WebGL2 renderer for {@link TileChunkNode}. Each tile is one
 * instanced quad; tiles are batched by `(shader, tileset texture)` and one
 * `drawArraysInstanced` is issued per batch. Per-chunk transforms ride on the
 * shared transform buffer (one row per chunk node), so the chunk geometry is
 * orientation-neutral and never re-uploaded for a camera pan.
 * @internal
 */
export class WebGl2TileChunkRenderer extends AbstractWebGl2Renderer<TileChunkNode> implements WebGl2RetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in (Track B): a tile chunk's per-flush
   * instanced batches (fixed 32-byte layout, tile word at word 7) can be
   * recorded into a group's instruction set and replayed from group-owned
   * resources. Pixel-snapped draws are excluded by the collect-time
   * recordability predicate (and belt-and-braces poisoning in {@link render});
   * tile chunks have no custom-material path to exclude.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _shader: Shader;
  private readonly _batchSize: number;
  private readonly _instanceData: ArrayBuffer;
  private readonly _instanceFloat32: Float32Array;
  private readonly _instanceUint32: Uint32Array;

  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  // Pinned unit index for the single tileset texture sampler (unit 0), reused
  // by the live flush and retained replay so both stay allocation-free.
  private readonly _baseTextureUnitScratch: Int32Array = new Int32Array([0]);
  // Reused single-slot texture list handed to the backend at record time; a
  // tile chunk batch always binds exactly one tileset texture (slot 0).
  private readonly _recordTextures: Array<Texture | RenderTexture | null> = [null];

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | null = null;
  private _currentView: View | null = null;
  private _currentViewId = -1;
  private _currentGroupTransformId = -1;

  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _connection: TileRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
    this._shader = new Shader(tileVertexSource, tileFragmentSource);
    this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
  }

  public render(node: TileChunkNode): void {
    const pages = node.pages;

    if (pages.length === 0) {
      return;
    }

    const backend = this.getBackend();

    // Belt-and-braces for retained recording: the collect-time recordability
    // predicate already excludes pixel-snapped draws from ever arming a
    // capture. If one still arrives inside an active capture window, poison
    // the recording so the resulting set can never validate — degrading to
    // entry replay instead of wrong pixels.
    if (backend._isRetainedCapturing && node.pixelSnapMode !== 'none') {
      backend._poisonRetainedCaptures();
    }

    const blendMode = node.blendMode;
    const tintRgba = node.tint.toRgba();

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(node);

    for (const page of pages) {
      this._renderPage(backend, page.texture, page.quads, blendMode, tintRgba, nodeIndex);
    }
  }

  private _renderPage(
    backend: WebGl2Backend,
    texture: Texture,
    quads: readonly TileQuad[],
    blendMode: BlendModes,
    tintRgba: number,
    nodeIndex: number,
  ): void {
    if (quads.length === 0) {
      return;
    }

    const textureChanged = this._currentTexture !== null && texture !== this._currentTexture;
    const blendModeChanged = blendMode !== this._currentBlendMode;

    if (this._quadIndex > 0 && (blendModeChanged || textureChanged || this._quadIndex + quads.length > this._batchSize)) {
      this.flush();
    }

    if (this._currentBlendMode === null || this._currentBlendMode !== blendMode) {
      this._currentBlendMode = blendMode;
      backend.setBlendMode(blendMode);
    }

    if (this._currentTexture !== texture) {
      this._currentTexture = texture;
      backend.bindTexture(texture, 0);
    }

    const flipY = texture.flipY;

    // A chunk page may hold more tiles than the fixed batch buffer; write in
    // batch-sized runs, flushing (and re-establishing state) between runs.
    let offset = 0;

    while (offset < quads.length) {
      const remaining = quads.length - offset;
      const runSize = Math.min(remaining, this._batchSize);

      this._writeRun(quads, offset, runSize, flipY, tintRgba, nodeIndex);

      offset += runSize;

      if (offset < quads.length) {
        this.flush();
        this._currentBlendMode = blendMode;
        backend.setBlendMode(blendMode);
        this._currentTexture = texture;
        backend.bindTexture(texture, 0);
      }
    }
  }

  private _writeRun(
    quads: readonly TileQuad[],
    offset: number,
    count: number,
    flipY: boolean,
    tintRgba: number,
    nodeIndex: number,
  ): void {
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const baseWord = nodeIndex & TILE_ROW_MASK;

    for (let i = 0; i < count; i++) {
      const q = quads[offset + i]!;
      const idx = this._quadIndex * wordsPerInstance;

      f32[idx + 0] = q.x0;
      f32[idx + 1] = q.y0;
      f32[idx + 2] = q.x1;
      f32[idx + 3] = q.y1;

      // Bake flipX/flipY into the UV corner ordering; the diagonal axis swap is
      // resolved in the shader. Texture flipY (uploaded-flipped atlases) is an
      // additional vertical swap that composes with the tile flipY.
      const flipX = (q.orient & 1) !== 0;
      const tileFlipY = (q.orient & 2) !== 0;
      const diagonal = (q.orient & 4) !== 0;

      const uA = flipX ? q.u1 : q.u0;
      const uB = flipX ? q.u0 : q.u1;
      let vA = tileFlipY ? q.v1 : q.v0;
      let vB = tileFlipY ? q.v0 : q.v1;

      if (flipY) {
        const swap = vA;
        vA = vB;
        vB = swap;
      }

      const uMin = (uA * 0xffff) & 0xffff;
      const vMin = (vA * 0xffff) & 0xffff;
      const uMax = (uB * 0xffff) & 0xffff;
      const vMax = (vB * 0xffff) & 0xffff;

      u32[idx + 4] = uMin | (vMin << 16);
      u32[idx + 5] = uMax | (vMax << 16);
      u32[idx + 6] = tintRgba;
      u32[idx + 7] = (diagonal ? baseWord | TILE_DIAGONAL_BIT : baseWord) >>> 0;

      this._quadIndex++;
    }

    if (nodeIndex > this._maxNodeIndex) {
      this._maxNodeIndex = nodeIndex;
    }
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const instanceBuffer = this._instanceBuffer;
    const vao = this._vao;

    if (this._quadIndex === 0 || backend === null || instanceBuffer === null || vao === null) {
      this._quadIndex = 0;
      this._maxNodeIndex = 0;
      return;
    }

    this._stageViewUniforms(backend);

    if (this._currentTexture !== null) {
      this._shader.getUniform('u_texture').setValue(this._baseTextureUnitScratch);
    }

    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);
    this._shader.getUniform('u_transforms').setValue(this._transformUnitScratch);

    this._shader.sync();
    backend.bindVertexArrayObject(vao);
    instanceBuffer.upload(this._instanceFloat32.subarray(0, this._quadIndex * wordsPerInstance));
    vao.drawInstanced(4, 0, this._quadIndex, RenderingPrimitives.TriangleStrip);
    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Retained recording (Track B): while a capture window is open, hand the
    // exact packed instance words of this flush to the backend — byte-
    // identical to what just drew. A batch always binds a single tileset
    // texture (slot 0); a pixel-snapped node already poisoned the capture in
    // render().
    if (backend._isRetainedCapturing && this._currentTexture !== null) {
      this._recordTextures[0] = this._currentTexture;
      backend._recordRetainedBatch(
        this,
        this._instanceUint32.subarray(0, this._quadIndex * wordsPerInstance),
        this._quadIndex,
        this._currentBlendMode ?? BlendModes.Normal,
        this._recordTextures,
        1,
      );
    }

    this._quadIndex = 0;
    this._maxNodeIndex = 0;
  }

  /**
   * Stage `u_projection` (live view) and `u_group` (live composed group
   * matrix) on the shader, guarded by cached view/group stamps. Shared by the
   * live flush path and retained-batch replay — replay resolves exactly the
   * same live state a slow-path flush would.
   */
  private _stageViewUniforms(backend: WebGl2Backend): void {
    const view = backend.view;

    if (this._currentView !== view || this._currentViewId !== view.updateId) {
      this._currentView = view;
      this._currentViewId = view.updateId;
      this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }

    if (this._currentGroupTransformId !== backend.renderGroupTransformId) {
      this._currentGroupTransformId = backend.renderGroupTransformId;

      const groupTransform = backend.renderGroupTransform;

      this._shader.getUniform('u_group').setValue(groupTransform !== null ? groupTransform.toArray(false) : identityGroupMat3);
    }
  }

  // ── Retained-batch record/replay (Track B) ────────────────────────────────
  // The bundle stores raw instance bytes; this renderer owns the 32-byte
  // layout (tile word at word 7: transform row in bits 0..28, diagonal flip in
  // bit 29), so the layout-aware finalize steps (node-index scan/rebase, VAO
  // attribute wiring) and the replay dispatch live here — mirroring
  // WebGl2NineSliceSpriteRenderer's seam.

  /** @internal See {@link WebGl2RetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(payload: WebGl2RetainedBatchPayload, range: WebGl2RetainedNodeIndexRange): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      // In-bounds: the payload's word range was appended to the bundle store.
      // The tile word is the last word of the 32-byte (8-word) instance
      // layout; only the low 29 bits address the transform buffer row — the
      // diagonal-flip flag (bit 29) is orientation, not a row index.
      const row = words[start + i * wordsPerInstance + 7]! & TILE_ROW_MASK;

      if (row < range.min) {
        range.min = row;
      }

      if (row > range.max) {
        range.max = row;
      }
    }
  }

  /** @internal See {@link WebGl2RetainedBatchReplayer._rebaseRetainedNodeIndices} (group-local indices). */
  public _rebaseRetainedNodeIndices(payload: WebGl2RetainedBatchPayload, base: number): void {
    const words = payload.bundle.instanceWords;
    const start = payload.byteOffset / Uint32Array.BYTES_PER_ELEMENT;

    for (let i = 0; i < payload.instanceCount; i++) {
      const index = start + i * wordsPerInstance + 7;
      // In-bounds: see the scan above. Rebase ONLY the row field; the
      // diagonal-flip bit must survive untouched or tile orientation corrupts.
      const word = words[index]!;
      const diagonal = word & TILE_DIAGONAL_BIT;
      const row = word & TILE_ROW_MASK;

      words[index] = (diagonal | ((row - base) & TILE_ROW_MASK)) >>> 0;
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
      throw new Error('WebGl2TileChunkRenderer: retained batch VAO configuration requires an uploaded bundle.');
    }

    const base = payload.byteOffset;

    vao
      .addAttribute(buffer, this._shader.getAttribute('a_quadBounds'), gl.FLOAT, false, instanceStrideBytes, base + 0, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, base + 16, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, instanceStrideBytes, base + 24, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_tileWord'), gl.UNSIGNED_INT, false, instanceStrideBytes, base + 28, true, 1);
  }

  /**
   * Replay one recorded batch: all STATE is resolved live — blend mode via
   * the backend's dedup, `u_projection`/`u_group` from the live view + live
   * composed group matrix (the camera-pan / group-move win), the single
   * tileset texture bound to unit 0 by recorded slot order — and only the
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

    if (payload.blendMode !== this._currentBlendMode) {
      this._currentBlendMode = payload.blendMode;
    }

    backend.setBlendMode(payload.blendMode);
    this._stageViewUniforms(backend);

    const textures = payload.textures;

    for (let i = 0; i < textures.length; i++) {
      // In-bounds: i < textures.length.
      backend.bindTexture(textures[i]!, i);
    }

    // Keep the live path's redundant-bind-skip cache coherent (a live
    // TileChunkNode outside the group and the replayed batches inside it
    // share this one renderer instance): unit 0 now actually holds this
    // batch's texture, bypassing render()'s `_currentTexture` check, so the
    // NEXT live draw must see the true bound texture or it wrongly skips its
    // own bind and renders with this batch's leftover texture.
    if (textures.length > 0) {
      this._currentTexture = textures[0] as Texture;
    }

    this._shader.getUniform('u_texture').setValue(this._baseTextureUnitScratch);

    // The group-owned transform store replaces the shared frame buffer on the
    // SAME unit/sampler — zero GLSL changes. The next live flush re-binds the
    // shared texture through bindTransformBufferTexture.
    backend.bindTexture(transformTexture, transformTextureUnit);
    this._shader.getUniform('u_transforms').setValue(this._transformUnitScratch);

    this._shader.sync();
    backend.bindVertexArrayObject(vao);
    vao.drawInstanced(4, 0, payload.instanceCount, RenderingPrimitives.TriangleStrip);
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    this._shader.connect(createWebGl2ShaderProgram(gl));
    this._connection = this._createConnection(gl);
    this._instanceBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._instanceData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(this._connection),
    );
    this._shader.sync();

    this._vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_quadBounds'), gl.FLOAT, false, instanceStrideBytes, 0, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, 16, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, instanceStrideBytes, 24, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_tileWord'), gl.UNSIGNED_INT, false, instanceStrideBytes, 28, true, 1)
      .connect(this._createVaoRuntime(this._connection));
  }

  protected onDisconnect(): void {
    this._shader.disconnect();
    this._instanceBuffer?.destroy();
    this._instanceBuffer = null;
    this._vao?.destroy();
    this._vao = null;
    this._connection = null;
    this._currentBlendMode = null;
    this._currentTexture = null;
    this._currentView = null;
    this._currentViewId = -1;
    this._currentGroupTransformId = -1;
    this._quadIndex = 0;
    this._maxNodeIndex = 0;
  }

  public destroy(): void {
    this.disconnect();
    this._shader.destroy();
  }

  private _createConnection(gl: WebGL2RenderingContext): TileRendererConnection {
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2TileChunkRenderer: could not create vertex array object.');
    }

    return { gl, buffers: new Map(), vaoHandle };
  }

  private _createBufferRuntime(connection: TileRendererConnection): WebGl2RenderBufferRuntime {
    const handle = connection.gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2TileChunkRenderer: could not create render buffer.');
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

  private _createVaoRuntime(connection: TileRendererConnection): WebGl2VertexArrayObjectRuntime {
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
