import { Shader } from '#rendering/shader/Shader';
import type { NineSliceQuad } from '#rendering/sprite/nineSlice';
import type { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { type BlendModes, BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGl2Renderer } from './AbstractWebGl2Renderer';
import fragmentSource from './glsl/nine-slice-sprite.frag';
import vertexSource from './glsl/nine-slice-sprite.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const transformTextureUnit = 1;

interface NineSliceRendererConnection {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: Map<WebGl2RenderBuffer, { handle: WebGLBuffer; dataByteLength: number }>;
  readonly vaoHandle: WebGLVertexArrayObject;
}

/** Instanced renderer for {@link NineSliceSprite} using WebGL2. */
export class WebGl2NineSliceSpriteRenderer extends AbstractWebGl2Renderer<NineSliceSprite> {
  private readonly _shader: Shader;
  private readonly _batchSize: number;
  private readonly _instanceData: ArrayBuffer;
  private readonly _instanceFloat32: Float32Array;
  private readonly _instanceUint32: Uint32Array;

  private readonly _transformUnitScratch: Int32Array = new Int32Array([transformTextureUnit]);

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | RenderTexture | null = null;
  private _currentView: View | null = null;
  private _currentViewId = -1;

  private _instanceBuffer: WebGl2RenderBuffer | null = null;
  private _vao: WebGl2VertexArrayObject | null = null;
  private _connection: NineSliceRendererConnection | null = null;

  public constructor(batchSize: number) {
    super();

    this._batchSize = batchSize;
    this._shader = new Shader(vertexSource, fragmentSource);
    this._instanceData = new ArrayBuffer(batchSize * instanceStrideBytes);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
  }

  public render(sprite: NineSliceSprite): void {
    const quads = sprite.quads;

    if (quads.length === 0) {
      return;
    }

    const backend = this.getBackend();
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
    // Process in chunks, flushing between each chunk.
    let offset = 0;

    while (offset < quads.length) {
      const remaining = quads.length - offset;
      const chunkSize = Math.min(remaining, this._batchSize);
      const chunk = (offset === 0 && chunkSize === quads.length)
        ? quads
        : quads.slice(offset, offset + chunkSize);

      this._writeQuadChunk(chunk, texture, tintRgba, nodeIndex);

      offset += chunkSize;

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
    texture: Texture | RenderTexture,
    tintRgba: number,
    nodeIndex: number,
  ): void {
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const flipY = texture.flipY;

    for (const q of quads) {
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

    const view = backend.view;

    if (this._currentView !== view || this._currentViewId !== view.updateId) {
      this._currentView = view;
      this._currentViewId = view.updateId;
      this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
    }

    if (this._currentTexture !== null) {
      this._shader.getUniform('u_texture').setValue(new Int32Array([0]));
    }

    backend.bindTransformBufferTexture(transformTextureUnit, this._maxNodeIndex + 1);
    this._shader.getUniform('u_transforms').setValue(this._transformUnitScratch);

    this._shader.sync();
    backend.bindVertexArrayObject(vao);
    instanceBuffer.upload(this._instanceFloat32.subarray(0, this._quadIndex * wordsPerInstance));
    vao.drawInstanced(4, 0, this._quadIndex, RenderingPrimitives.TriangleStrip);
    backend.stats.batches++;
    backend.stats.drawCalls++;

    this._quadIndex = 0;
    this._maxNodeIndex = 0;
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
