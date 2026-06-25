import { Rectangle } from '#math/Rectangle';
import { Shader } from '#rendering/shader/Shader';
import type { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { computeShaderTiling, type RepeatingSpriteQuad } from '#rendering/sprite/repeatingSpritePlan';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { RepeatMode } from '#rendering/texture/repeat';
import { Texture } from '#rendering/texture/Texture';
import { type BlendModes, BufferTypes, BufferUsage, RenderingPrimitives, ScaleModes, WrapModes } from '#rendering/types';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

// ---------------------------------------------------------------------------
// Shader path: one quad per sprite, UVs computed in vertex shader.
// ---------------------------------------------------------------------------

const shaderPathVertSource = `#version 300 es
precision mediump float;
precision highp int;

layout(location = 0) in vec4 a_quadBounds;   // x0,y0,x1,y1 (local space)
layout(location = 1) in vec4 a_uvParams;     // tilingX, tilingY, offsetU, offsetV
layout(location = 2) in vec4 a_color;        // RGBA tint (normalised)
layout(location = 3) in uint a_nodeIndex;    // transform row

uniform mat3 u_projection;
uniform sampler2D u_transforms;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    int vid = gl_VertexID;
    int cx = vid & 1;
    int cy = (vid >> 1) & 1;

    float lx = (cx == 0) ? a_quadBounds.x : a_quadBounds.z;
    float ly = (cy == 0) ? a_quadBounds.y : a_quadBounds.w;

    float destW = a_quadBounds.z - a_quadBounds.x;
    float destH = a_quadBounds.w - a_quadBounds.y;

    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);

    float wx = m0.x * lx + m0.y * ly + m1.x;
    float wy = m0.z * lx + m0.w * ly + m1.y;
    gl_Position = vec4((u_projection * vec3(wx, wy, 1.0)).xy, 0.0, 1.0);

    float u = (destW > 0.0)
        ? ((lx - a_quadBounds.x) / destW) * a_uvParams.x + a_uvParams.z
        : a_uvParams.z;
    float v = (destH > 0.0)
        ? ((ly - a_quadBounds.y) / destH) * a_uvParams.y + a_uvParams.w
        : a_uvParams.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}`;

// ---------------------------------------------------------------------------
// Geometry path: N quads per sprite, UVs pre-computed in CPU (like NineSlice).
// ---------------------------------------------------------------------------

const geoPathVertSource = `#version 300 es
precision lowp float;
precision highp int;

layout(location = 0) in vec4 a_quadBounds;   // x0,y0,x1,y1 (local space)
layout(location = 1) in vec4 a_uvBounds;     // u0,v0,u1,v1 (normalised, flipY pre-applied)
layout(location = 2) in vec4 a_color;        // RGBA tint
layout(location = 3) in uint a_nodeIndex;    // transform row

uniform mat3 u_projection;
uniform sampler2D u_transforms;

out vec2 v_texcoord;
out vec4 v_color;

void main(void) {
    int vid = gl_VertexID;
    int cx = vid & 1;
    int cy = (vid >> 1) & 1;

    float lx = (cx == 0) ? a_quadBounds.x : a_quadBounds.z;
    float ly = (cy == 0) ? a_quadBounds.y : a_quadBounds.w;

    int row = int(a_nodeIndex);
    vec4 m0 = texelFetch(u_transforms, ivec2(0, row), 0);
    vec4 m1 = texelFetch(u_transforms, ivec2(1, row), 0);

    float wx = m0.x * lx + m0.y * ly + m1.x;
    float wy = m0.z * lx + m0.w * ly + m1.y;
    gl_Position = vec4((u_projection * vec3(wx, wy, 1.0)).xy, 0.0, 1.0);

    float u = (cx == 0) ? a_uvBounds.x : a_uvBounds.z;
    float v = (cy == 0) ? a_uvBounds.y : a_uvBounds.w;
    v_texcoord = vec2(u, v);

    v_color = vec4(a_color.rgb * a_color.a, a_color.a);
}`;

const sharedFragSource = `#version 300 es
precision lowp float;

uniform sampler2D u_texture;

in vec2 v_texcoord;
in vec4 v_color;

layout(location = 0) out vec4 fragColor;

void main(void) {
    fragColor = texture(u_texture, v_texcoord) * v_color;
}`;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const shaderStrideBytes = 40; // 10 × float32
const shaderWordsPerInstance = shaderStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

const geoStrideBytes = 32; // 8 × uint32 (matches NineSlice layout)
const geoWordsPerInstance = geoStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

const transformTextureUnit = 1;

// ---------------------------------------------------------------------------
// Sampler cache helper
// ---------------------------------------------------------------------------

function repeatModeToWrap(mode: RepeatMode): WrapModes {
  if (mode === 'repeat') return WrapModes.Repeat;
  if (mode === 'mirror-repeat') return WrapModes.MirroredRepeat;
  return WrapModes.ClampToEdge;
}

// ---------------------------------------------------------------------------
// Connection type
// ---------------------------------------------------------------------------

interface RendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly shaderVaoHandle: WebGLVertexArrayObject;
  readonly geoVaoHandle: WebGLVertexArrayObject;
}

/** Instanced renderer for {@link RepeatingSprite} using WebGL2. Handles both shader and geometry paths internally. */
export class WebGl2RepeatingSpriteRenderer extends AbstractWebGl2Renderer<RepeatingSprite> {
  private readonly _shaderPathShader: Shader;
  private readonly _geoPathShader: Shader;
  private readonly _batchSize: number;

  // Shader-path buffers
  private readonly _shaderData: ArrayBuffer;
  private readonly _shaderF32: Float32Array;
  private readonly _shaderU32: Uint32Array;
  private _shaderBuf: WebGl2RenderBuffer | null = null;
  private _shaderVao: WebGl2VertexArrayObject | null = null;
  private _shaderQuadCount = 0;

  // Geometry-path buffers
  private readonly _geoData: ArrayBuffer;
  private readonly _geoF32: Float32Array;
  private readonly _geoU32: Uint32Array;
  private _geoBuf: WebGl2RenderBuffer | null = null;
  private _geoVao: WebGl2VertexArrayObject | null = null;
  private _geoQuadCount = 0;

  // Sampler cache keyed by "wrapS:wrapT:scaleMode"
  private _samplers = new Map<string, WebGLSampler>();

  // Shared batch state
  private _maxNodeIndex = 0;
  private _currentTexture: Texture | RenderTexture | null = null;
  private _currentBlendMode: BlendModes | null = null;
  private _currentModeX: RepeatMode | null = null;
  private _currentModeY: RepeatMode | null = null;
  private _currentPath: 'shader' | 'geometry' | null = null;

  private _connection: RendererConnection | null = null;

  private readonly _transformUnitScratch = new Int32Array([transformTextureUnit]);
  private readonly _snapBounds = new Rectangle();
  private _currentView: unknown = null;
  private _currentViewId = -1;

  public constructor(batchSize: number) {
    super();
    this._batchSize = batchSize;
    this._shaderPathShader = new Shader(shaderPathVertSource, sharedFragSource);
    this._geoPathShader = new Shader(geoPathVertSource, sharedFragSource);

    this._shaderData = new ArrayBuffer(batchSize * shaderStrideBytes);
    this._shaderF32 = new Float32Array(this._shaderData);
    this._shaderU32 = new Uint32Array(this._shaderData);

    this._geoData = new ArrayBuffer(batchSize * geoStrideBytes);
    this._geoF32 = new Float32Array(this._geoData);
    this._geoU32 = new Uint32Array(this._geoData);
  }

  public render(sprite: RepeatingSprite): void {
    const strategy = sprite.resolvedStrategy;
    const texture = sprite.texture;
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

    const backend = this.getBackend();

    if (this._currentTexture !== texture) {
      this._currentTexture = texture;
      backend.bindTexture(texture, 0);
    }

    if (this._currentBlendMode !== blendMode) {
      this._currentBlendMode = blendMode;
      backend.setBlendMode(blendMode);
    }

    this._currentPath = strategy;

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    if (nodeIndex > this._maxNodeIndex) {
      this._maxNodeIndex = nodeIndex;
    }

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

    // When flipY, negate tilingY and start from tilingY so V runs top→bottom.
    const uvParamY = flipY ? -tilingY : tilingY;
    const uvParamW = flipY ? tilingY + offsetV : offsetV;

    if (this._shaderQuadCount >= this._batchSize) {
      this.flush();
    }

    const idx = this._shaderQuadCount * shaderWordsPerInstance;
    const f32 = this._shaderF32;
    const u32 = this._shaderU32;

    f32[idx + 0] = 0;
    f32[idx + 1] = 0;
    f32[idx + 2] = destW;
    f32[idx + 3] = destH;
    f32[idx + 4] = tilingX;
    f32[idx + 5] = uvParamY;
    f32[idx + 6] = offsetU;
    f32[idx + 7] = uvParamW;
    u32[idx + 8] = sprite.tint.toRgba();
    u32[idx + 9] = nodeIndex >>> 0;

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

    const flipY = sprite.texture instanceof Texture && sprite.texture.flipY;
    const tint = sprite.tint.toRgba();

    let offset = 0;

    while (offset < quads.length) {
      const remaining = quads.length - offset;
      const chunk = Math.min(remaining, this._batchSize - this._geoQuadCount);

      if (chunk <= 0) {
        this.flush();

        // Re-establish texture/blend after flush
        const backend = this.getBackend();
        backend.bindTexture(sprite.texture, 0);
        backend.setBlendMode(sprite.blendMode);
        this._currentTexture = sprite.texture;
        this._currentBlendMode = sprite.blendMode;
        this._currentPath = 'geometry';

        if (nodeIndex > this._maxNodeIndex) {
          this._maxNodeIndex = nodeIndex;
        }
        continue;
      }

      const f32 = this._geoF32;
      const u32 = this._geoU32;

      for (let i = 0; i < chunk; i++) {
        // In-bounds: `offset + i < offset + chunk <= quads.length`.
        const q = quads[offset + i]!;
        const idx = (this._geoQuadCount + i) * geoWordsPerInstance;

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
        u32[idx + 6] = tint;
        u32[idx + 7] = nodeIndex >>> 0;
      }

      this._geoQuadCount += chunk;
      offset += chunk;
    }
  }

  public flush(): void {
    const backend = this.getBackendOrNull();

    if (backend === null) {
      this._resetBatchState();
      return;
    }

    const view = backend.view;

    if (this._currentView !== view || this._currentViewId !== view.updateId) {
      this._currentView = view;
      this._currentViewId = view.updateId;
      const proj = view.getTransform().toArray(false);
      this._shaderPathShader.getUniform('u_projection').setValue(proj);
      this._geoPathShader.getUniform('u_projection').setValue(proj);
    }

    if (this._shaderQuadCount > 0) {
      this._flushShaderBatch(backend);
    }

    if (this._geoQuadCount > 0) {
      this._flushGeoBatch(backend);
    }

    this._resetBatchState();
  }

  private _flushShaderBatch(backend: WebGl2Backend): void {
    const conn = this._connection;
    const buf = this._shaderBuf;
    const vao = this._shaderVao;

    if (!conn || !buf || !vao || this._shaderQuadCount === 0) return;

    const gl = conn.gl;
    const texture = this._currentTexture;
    const scaleMode = texture instanceof Texture ? texture.scaleMode : ScaleModes.Linear;
    const wrapS = repeatModeToWrap(this._currentModeX ?? 'repeat');
    const wrapT = repeatModeToWrap(this._currentModeY ?? 'repeat');

    // Bind repeat sampler (overrides texture's own wrap params for this unit).
    const samplerHandle = this._getOrCreateSampler(gl, wrapS, wrapT, scaleMode);
    gl.bindSampler(0, samplerHandle);

    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);
    this._shaderPathShader.getUniform('u_texture').setValue(new Int32Array([0]));
    this._shaderPathShader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    this._shaderPathShader.sync();

    backend.bindVertexArrayObject(vao);
    buf.upload(this._shaderF32.subarray(0, this._shaderQuadCount * shaderWordsPerInstance));
    vao.drawInstanced(4, 0, this._shaderQuadCount, RenderingPrimitives.TriangleStrip);

    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Unbind sampler so subsequent draws use the texture's own wrap params.
    gl.bindSampler(0, null);

    this._shaderQuadCount = 0;
  }

  private _flushGeoBatch(backend: WebGl2Backend): void {
    const conn = this._connection;
    const buf = this._geoBuf;
    const vao = this._geoVao;

    if (!conn || !buf || !vao || this._geoQuadCount === 0) return;

    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);
    this._geoPathShader.getUniform('u_texture').setValue(new Int32Array([0]));
    this._geoPathShader.getUniform('u_transforms').setValue(this._transformUnitScratch);
    this._geoPathShader.sync();

    backend.bindVertexArrayObject(vao);
    buf.upload(this._geoF32.subarray(0, this._geoQuadCount * geoWordsPerInstance));
    vao.drawInstanced(4, 0, this._geoQuadCount, RenderingPrimitives.TriangleStrip);

    backend.stats.batches++;
    backend.stats.drawCalls++;

    this._geoQuadCount = 0;
  }

  private _resetBatchState(): void {
    this._shaderQuadCount = 0;
    this._geoQuadCount = 0;
    this._maxNodeIndex = 0;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._currentModeX = null;
    this._currentModeY = null;
    this._currentPath = null;
  }

  private _getOrCreateSampler(gl: WebGL2RenderingContext, wrapS: WrapModes, wrapT: WrapModes, scaleMode: ScaleModes): WebGLSampler {
    const key = `${wrapS}:${wrapT}:${scaleMode}`;
    const existing = this._samplers.get(key);
    if (existing !== undefined) return existing;

    const sampler = gl.createSampler();
    if (sampler === null) throw new Error('WebGl2RepeatingSpriteRenderer: could not create sampler.');

    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrapS);
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrapT);
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, scaleMode);
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, scaleMode);

    this._samplers.set(key, sampler);
    return sampler;
  }

  protected onConnect(backend: WebGl2Backend): void {
    const gl = backend.context;

    this._shaderPathShader.connect(createWebGl2ShaderProgram(gl));
    this._geoPathShader.connect(createWebGl2ShaderProgram(gl));

    // sync() triggers finalize() which compiles the shaders and populates the
    // attributes/uniforms maps — must happen before any getAttribute() call.
    this._shaderPathShader.sync();
    this._geoPathShader.sync();

    const conn = this._createConnection(gl);
    this._connection = conn;

    // Shader-path VAO (uses float4 uvParams, not packed unorm16)
    this._shaderBuf = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._shaderData, BufferUsage.DynamicDraw).connect(
      this._createBufRuntime(conn, 'shader'),
      backend.accountant,
    );

    this._shaderVao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(this._shaderBuf, this._shaderPathShader.getAttribute('a_quadBounds'), gl.FLOAT, false, shaderStrideBytes, 0, false, 1)
      .addAttribute(this._shaderBuf, this._shaderPathShader.getAttribute('a_uvParams'), gl.FLOAT, false, shaderStrideBytes, 16, false, 1)
      .addAttribute(this._shaderBuf, this._shaderPathShader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, shaderStrideBytes, 32, false, 1)
      .addAttribute(this._shaderBuf, this._shaderPathShader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, shaderStrideBytes, 36, true, 1)
      .connect(this._createVaoRuntime(conn, 'shader'));

    // Geometry-path VAO (packed unorm16 UVs, same layout as NineSlice)
    this._geoBuf = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._geoData, BufferUsage.DynamicDraw).connect(
      this._createBufRuntime(conn, 'geo'),
      backend.accountant,
    );

    this._geoVao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip)
      .addAttribute(this._geoBuf, this._geoPathShader.getAttribute('a_quadBounds'), gl.FLOAT, false, geoStrideBytes, 0, false, 1)
      .addAttribute(this._geoBuf, this._geoPathShader.getAttribute('a_uvBounds'), gl.UNSIGNED_SHORT, true, geoStrideBytes, 16, false, 1)
      .addAttribute(this._geoBuf, this._geoPathShader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, geoStrideBytes, 24, false, 1)
      .addAttribute(this._geoBuf, this._geoPathShader.getAttribute('a_nodeIndex'), gl.UNSIGNED_INT, false, geoStrideBytes, 28, true, 1)
      .connect(this._createVaoRuntime(conn, 'geo'));
  }

  protected onDisconnect(): void {
    const gl = this._connection?.gl;

    if (gl !== undefined) {
      for (const sampler of this._samplers.values()) {
        gl.deleteSampler(sampler);
      }
    }
    this._samplers.clear();

    this._shaderPathShader.disconnect();
    this._geoPathShader.disconnect();
    this._shaderBuf?.destroy();
    this._shaderBuf = null;
    this._shaderVao?.destroy();
    this._shaderVao = null;
    this._geoBuf?.destroy();
    this._geoBuf = null;
    this._geoVao?.destroy();
    this._geoVao = null;
    this._connection = null;
    this._currentView = null;
    this._currentViewId = -1;
    this._resetBatchState();
  }

  public destroy(): void {
    this.disconnect();
    this._shaderPathShader.destroy();
    this._geoPathShader.destroy();
  }

  // -----------------------------------------------------------------------
  // Private GL helpers
  // -----------------------------------------------------------------------

  private _createConnection(gl: WebGL2RenderingContext): RendererConnection {
    const shaderVaoHandle = gl.createVertexArray();
    const geoVaoHandle = gl.createVertexArray();

    if (shaderVaoHandle === null || geoVaoHandle === null) {
      throw new Error('WebGl2RepeatingSpriteRenderer: could not create vertex array object.');
    }

    return { gl, buffers: new Map(), shaderVaoHandle, geoVaoHandle };
  }

  private _createBufRuntime(conn: RendererConnection, _kind: string): WebGl2RenderBufferRuntime {
    const handle = conn.gl.createBuffer();
    if (handle === null) throw new Error('WebGl2RepeatingSpriteRenderer: could not create render buffer.');

    return {
      bind: (buffer): void => {
        conn.gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer, offset): void => {
        const gl = conn.gl;
        const data = buffer.data;
        const state = conn.buffers.get(buffer);

        gl.bindBuffer(buffer.type, handle);
        if (state && state.dataByteLength >= data.byteLength) {
          gl.bufferSubData(buffer.type, offset, data);
          state.dataByteLength = data.byteLength;
        } else {
          gl.bufferData(buffer.type, data, buffer.usage);
          conn.buffers.set(buffer, { handle, dataByteLength: data.byteLength });
        }
      },
      destroy: (buffer): void => {
        conn.gl.deleteBuffer(handle);
        conn.buffers.delete(buffer);
        buffer.disconnect();
      },
    };
  }

  private _createVaoRuntime(conn: RendererConnection, kind: 'shader' | 'geo'): WebGl2VertexArrayObjectRuntime {
    const vaoHandle = kind === 'shader' ? conn.shaderVaoHandle : conn.geoVaoHandle;
    let appliedVersion = -1;

    return {
      bind: (vao): void => {
        const gl = conn.gl;
        gl.bindVertexArray(vaoHandle);

        if (appliedVersion !== vao.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attr of vao.attributes) {
            if (lastBuffer !== attr.buffer) {
              attr.buffer.bind();
              lastBuffer = attr.buffer;
            }
            if (attr.integer) {
              gl.vertexAttribIPointer(attr.location, attr.size, attr.type, attr.stride, attr.start);
            } else {
              gl.vertexAttribPointer(attr.location, attr.size, attr.type, attr.normalized, attr.stride, attr.start);
            }
            gl.enableVertexAttribArray(attr.location);
            gl.vertexAttribDivisor(attr.location, attr.divisor);
          }
          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        conn.gl.bindVertexArray(null);
      },
      draw: (_vao, size, start, type): void => {
        conn.gl.drawArrays(type, start, size);
      },
      drawInstanced: (_vao, count, start, instanceCount, type): void => {
        conn.gl.drawArraysInstanced(type, start, count, instanceCount);
      },
      destroy: (vao): void => {
        conn.gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }
}
