import { Shader } from '#rendering/shader/Shader';
import type { NineSliceQuad } from '#rendering/sprite/nineSlice';
import type { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import type { WebGl2RetainedBatchPayload, WebGl2RetainedBatchReplayer, WebGl2RetainedNodeIndexRange } from './WebGl2RetainedGroupResources';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

const nineSliceVertexSource = `#version 300 es
precision highp float;
precision highp int;

// Per-instance attributes (divisor = 1). One entry per nine-slice quad.
// gl_VertexID 0..3 selects which corner of the quad this invocation computes.
layout(location = 0) in vec4 a_quadBounds;   // x0, y0, x1, y1 (local space)
layout(location = 1) in vec4 a_uvBounds;     // u0, v0, u1, v1 (normalised, flipY pre-applied)
layout(location = 2) in vec4 a_color;        // RGBA tint
layout(location = 3) in uint a_nodeIndex;    // row into the shared transform buffer

uniform mat3 u_projection;
uniform mat3 u_group;
uniform vec4 u_viewport;                     // device-pixel viewport rect (x, y, width, height)
uniform sampler2D u_transforms;              // shared per-frame transform buffer (3 texels/row)

out vec2 v_texcoord;
out vec4 v_color;

// Round one local boundary coordinate to the device grid along an axis whose
// local→device scale is \`scale\`: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Degenerate scales pass the value through unchanged.
float snapBoundary(float localValue, float scale) {
    if (abs(scale) < 1e-6) return localValue;
    return floor(localValue * scale + 0.5) / scale;
}

void main(void) {
    // gl_VertexID 0..3 -> corner: 0=TL, 1=TR, 2=BL, 3=BR (TRIANGLE_STRIP order)
    int vid = gl_VertexID;
    int cornerX = vid & 1;
    int cornerY = (vid >> 1) & 1;

    float localX = (cornerX == 0) ? a_quadBounds.x : a_quadBounds.z;
    float localY = (cornerY == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0); // a, b, c, d
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0); // tx, ty, snapMode, 0

    // Geometry boundary snap: round each local corner to the device grid so the
    // quad edges land on whole device pixels (m1.z == 2.0, axis-aligned only).
    // Derive the per-axis device scale from the composed pipeline: device
    // positions of the local origin and the two local unit axes give scaleX/
    // scaleY (device-per-local) and the cross-terms.
    // Shared nine-slice quad edges are the same local value, so this pure snap
    // moves both neighbours identically — the internal seams stay closed.
    if (m1.z == 2.0) {
        vec2 vp = u_viewport.zw;
        vec3 dO = u_projection * u_group * vec3(m1.x, m1.y, 1.0);          // NOTE: origin uses row translation
        vec2 devO = u_viewport.xy + (dO.xy * 0.5 + 0.5) * vp;
        // The linear part maps local (1,0)->(m0.x,m0.z), (0,1)->(m0.y,m0.w).
        vec3 dX = u_projection * u_group * vec3(m1.x + m0.x, m1.y + m0.z, 1.0);
        vec3 dY = u_projection * u_group * vec3(m1.x + m0.y, m1.y + m0.w, 1.0);
        vec2 devX = u_viewport.xy + (dX.xy * 0.5 + 0.5) * vp;
        vec2 devY = u_viewport.xy + (dY.xy * 0.5 + 0.5) * vp;
        float scaleX = devX.x - devO.x;
        float scaleY = devY.y - devO.y;
        float crossXy = devX.y - devO.y;
        float crossYx = devY.x - devO.x;
        if (abs(crossXy) < 1e-3 && abs(crossYx) < 1e-3) { // axis-aligned
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    float worldX = (m0.x * localX) + (m0.y * localY) + m1.x;
    float worldY = (m0.z * localX) + (m0.w * localY) + m1.y;

    vec2 clip = (u_projection * u_group * vec3(worldX, worldY, 1.0)).xy;

    // Render-only pixel snapping (m1.z: 0 = none, 1 = position, 2 = geometry —
    // both non-zero modes snap the origin). Snap the node ORIGIN's device-pixel
    // position and rigid-shift the whole primitive by the same delta. floor(x+0.5)
    // matches the CPU Math.round policy; GLSL round() is undefined at .5. Grid
    // alignment is independent of the y-axis convention because the staged
    // viewport rect is whole device pixels.
    if (m1.z != 0.0) {
        vec2 originClip = (u_projection * u_group * vec3(m1.x, m1.y, 1.0)).xy;
        vec2 originDevice = u_viewport.xy + (originClip * 0.5 + 0.5) * u_viewport.zw;
        clip += (floor(originDevice + 0.5) - originDevice) * 2.0 / max(u_viewport.zw, vec2(1.0));
    }

    gl_Position = vec4(clip, 0.0, 1.0);

    float u = (cornerX == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cornerY == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}`;

const nineSliceFragmentSource = `#version 300 es
precision lowp float;

uniform sampler2D u_texture;

// UVs need full precision on mobile GLES (the lowp default would quantise
// them); the color varying stays lowp for 8-bit output.
in highp vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    vec4 sampleColor = texture(u_texture, v_texcoord);
    fragColor = sampleColor * v_color;
}`;

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const transformTextureUnit = 1;
const identityGroupMat3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

interface NineSliceRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vaoHandle: WebGLVertexArrayObject;
}

/** Instanced renderer for {@link NineSliceSprite} using WebGL2. */
export class WebGl2NineSliceSpriteRenderer extends AbstractWebGl2Renderer<NineSliceSprite> implements WebGl2RetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in (Track B Slice 3, S3-D5.1): a nine-slice
   * group's per-flush instanced batches (fixed 32-byte layout, node index at
   * word 7 — the same seam as the sprite renderer) can be recorded into a
   * group's instruction set and replayed from group-owned resources.
   * Pixel-snapped draws are excluded by the collect-time recordability
   * predicate (and belt-and-braces poisoning in {@link render}); nine-slice
   * has no custom-material path to exclude.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _shader: Shader;
  private readonly _batchSize: number;
  private readonly _instanceData: ArrayBuffer;
  private readonly _instanceFloat32: Float32Array;
  private readonly _instanceUint32: Uint32Array;

  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);
  // Pinned unit index for the single base texture sampler (unit 0), reused by
  // the live flush and retained replay so both stay allocation-free.
  private readonly _baseTextureUnitScratch: Int32Array = new Int32Array([0]);
  // Reused single-slot texture list handed to the backend at record time; the
  // nine-slice batch always binds exactly one base texture (slot 0).
  private readonly _recordTextures: Array<Texture | RenderTexture | null> = [null];

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | RenderTexture | null = null;
  private _currentView: View | null = null;
  private _currentViewId = -1;
  private _currentGroupTransformId = -1;

  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _connection: NineSliceRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
    this._shader = new Shader(nineSliceVertexSource, nineSliceFragmentSource);
    this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
  }

  public render(sprite: NineSliceSprite): void {
    const backend = this.getBackend();

    // Always upload the raw content quads. Geometry-mode boundary snapping is
    // resolved in the vertex shader (the `snapBoundary` block, gated on the
    // row's snap flag), so no CPU quad snap happens here and logical geometry
    // is never mutated. Shared quad edges snap identically in-shader, keeping
    // the internal seams closed.
    const quads: readonly NineSliceQuad[] = sprite.quads;

    if (quads.length === 0) {
      return;
    }

    const texture = sprite.texture;
    const blendMode = sprite.blendMode;
    const tintRgba = sprite.tint.toRgba();

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    const textureChanged = this._currentTexture !== null && texture !== this._currentTexture;
    const blendModeChanged = blendMode !== this._currentBlendMode;

    // If the batch would overflow with current quads + new quads, flush first.
    if (this._quadIndex > 0) {
      if (blendModeChanged || textureChanged || this._quadIndex + quads.length > this._batchSize) {
        this.flush();
      }
    }

    // Establish blend and texture state (may have been cleared by flush).
    if (this._currentBlendMode === null || this._currentBlendMode !== blendMode) {
      this._currentBlendMode = blendMode;
      backend.setBlendMode(blendMode);
    }

    if (this._currentTexture !== texture) {
      this._currentTexture = texture;
      backend.bindTexture(texture, 0);
    }

    // A single sprite may produce more quads than the fixed batch buffer can hold.
    // Process in [start, end) chunks, flushing between each. Iterating by index
    // range (rather than `quads.slice(...)`) keeps the overflow path allocation-free.
    let offset = 0;

    while (offset < quads.length) {
      const chunkEnd = Math.min(offset + this._batchSize, quads.length);

      this._writeQuadChunk(quads, offset, chunkEnd, texture, tintRgba, nodeIndex);

      offset = chunkEnd;

      if (offset < quads.length) {
        this.flush();
        // Re-establish state after flush
        this._currentBlendMode = blendMode;
        backend.setBlendMode(blendMode);
        this._currentTexture = texture;
        backend.bindTexture(texture, 0);
      }
    }
  }

  private _writeQuadChunk(
    quads: readonly NineSliceQuad[],
    start: number,
    end: number,
    texture: Texture | RenderTexture,
    tintRgba: number,
    nodeIndex: number,
  ): void {
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const flipY = texture.flipY;

    for (let i = start; i < end; i++) {
      // In-bounds: callers pass `[start, end)` ⊆ `[0, quads.length)`.
      const q = quads[i]!;
      const idx = this._quadIndex * wordsPerInstance;

      f32[idx + 0] = q.x0;
      f32[idx + 1] = q.y0;
      f32[idx + 2] = q.x1;
      f32[idx + 3] = q.y1;

      const uMin = (q.u0 * 0xffff) & 0xffff;
      const uMax = (q.u1 * 0xffff) & 0xffff;
      const v0Raw = (q.v0 * 0xffff) & 0xffff;
      const v1Raw = (q.v1 * 0xffff) & 0xffff;
      const vMin = flipY ? v1Raw : v0Raw;
      const vMax = flipY ? v0Raw : v1Raw;

      u32[idx + 4] = uMin | (vMin << 16);
      u32[idx + 5] = uMax | (vMax << 16);
      u32[idx + 6] = tintRgba;
      u32[idx + 7] = nodeIndex >>> 0;

      this._quadIndex++;

      if (nodeIndex > this._maxNodeIndex) {
        this._maxNodeIndex = nodeIndex;
      }
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

    // Retained recording (Slice 3): while a capture window is open, hand the
    // exact packed instance words of this flush to the backend — byte-identical
    // to what just drew, no duplicated packing logic. The nine-slice batch
    // always binds a single base texture (slot 0); a pixel-snapped draw already
    // poisoned the capture in render().
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
   * Stage `u_projection` (live view) and `u_group` (live composed group matrix)
   * on the shader, guarded by the cached view/group stamps. Shared by the live
   * flush path and retained-batch replay — replay resolves exactly the same
   * live state a slow-path flush would (S3-D1).
   */
  private _stageViewUniforms(backend: WebGl2Backend): void {
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

    backend._stageViewportUniform(this._shader);
  }

  // ── Retained-batch record/replay (Track B Slice 3) ───────────────────────
  // The bundle stores raw instance bytes; this renderer owns the 32-byte
  // layout (node index at word 7), so the layout-aware finalize steps
  // (node-index scan/rebase, VAO attribute wiring) and the replay dispatch
  // live here — mirroring WebGl2SpriteRenderer's seam, adapted to nine-slice's
  // single-texture, per-instance-tint attribute set.

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
      throw new Error('WebGl2NineSliceSpriteRenderer: retained batch VAO configuration requires an uploaded bundle.');
    }

    const base = payload.byteOffset;

    vao
      .addAttribute(buffer, this._shader.getAttribute('a_quadBounds'), gl.FLOAT, false, instanceStrideBytes, base + 0, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, base + 16, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, instanceStrideBytes, base + 24, false, 1)
      .addAttribute(buffer, this._shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, instanceStrideBytes, base + 28, true, 1);
  }

  /**
   * Replay one recorded batch: all STATE is resolved live — blend mode via the
   * backend's dedup, `u_projection`/`u_group` from the live view + composed
   * group matrix (the camera-pan / group-move win), the single base texture
   * bound to unit 0 by recorded slot order — and only the DATA is cached: the
   * instance bytes in the bundle buffer (bound through the per-batch VAO) and
   * the group-owned transform texture on the shared transform unit. The backend
   * hook flushed any pending live batch before dispatching here and bumps the
   * stats from the instruction descriptor.
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

    // Keep this renderer's blend tracking in sync so the next live batch still
    // detects its own blend changes correctly.
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

    this._shader.getUniform('u_texture').setValue(this._baseTextureUnitScratch);

    // The group-owned transform store replaces the shared frame buffer on the
    // SAME unit/sampler — zero GLSL changes (S3-D4). The next live flush
    // re-binds the shared texture through bindTransformBufferTexture.
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
      backend.accountant,
    );
    this._shader.sync();

    this._vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_quadBounds'), gl.FLOAT, false, instanceStrideBytes, 0, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, instanceStrideBytes, 16, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, instanceStrideBytes, 24, false, 1)
      .addAttribute(this._instanceBuffer, this._shader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, instanceStrideBytes, 28, true, 1)
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

  private _createConnection(gl: WebGL2RenderingContext): NineSliceRendererConnection {
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2NineSliceSpriteRenderer: could not create vertex array object.');
    }

    return { gl, buffers: new Map(), vaoHandle };
  }

  private _createBufferRuntime(connection: NineSliceRendererConnection): WebGl2RenderBufferRuntime {
    const handle = connection.gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2NineSliceSpriteRenderer: could not create render buffer.');
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

  private _createVaoRuntime(connection: NineSliceRendererConnection): WebGl2VertexArrayObjectRuntime {
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
