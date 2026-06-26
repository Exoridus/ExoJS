import { Shader } from '#rendering/shader/Shader';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes, BufferTypes, BufferUsage } from '#rendering/types';

import fragmentSource from './glsl/backdrop-blend.frag';
import vertexSource from './glsl/backdrop-blend.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

interface BackdropBlendCompositorConnection {
  readonly gl: WebGL2RenderingContext;
  readonly vaoHandle: WebGLVertexArrayObject;
  readonly vao: WebGl2VertexArrayObject;
  readonly indexBuffer: WebGl2RenderBuffer;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly bufferHandles: Map<WebGl2RenderBuffer, WebGLBuffer>;
}

// 4 floats per vertex: position(x, y) + texcoord(u, v).
const vertexStrideBytes = 16;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Single-quad backdrop-aware blend compositor used by
 * `WebGl2Backend.composeWithBackdropBlend`. Samples the premultiplied source
 * texture (slot 0) and the captured premultiplied backdrop texture (slot 1),
 * computes the W3C blend for the requested {@link BlendModes}, and draws the
 * result over the active target with normal (premultiplied source-over)
 * blending — so the GPU composites the blended source over the backdrop already
 * in the target.
 *
 * Mirrors {@link WebGl2MaskCompositor}'s structure; like it, this is invoked
 * directly by the backend and never participates in renderer-registry dispatch.
 */
export class WebGl2BackdropBlendCompositor {
  private readonly _shader: Shader = new Shader(vertexSource, fragmentSource);
  private readonly _vertexData: ArrayBuffer = new ArrayBuffer(4 * vertexStrideBytes);
  private readonly _float32View: Float32Array = new Float32Array(this._vertexData);
  private readonly _sourceSamplerSlot: Int32Array = new Int32Array([0]);
  private readonly _backdropSamplerSlot: Int32Array = new Int32Array([1]);
  private readonly _modeValue: Int32Array = new Int32Array([0]);
  private readonly _opaqueValue: Float32Array = new Float32Array([0]);
  private _connection: BackdropBlendCompositorConnection | null = null;

  public connect(backend: WebGl2Backend): void {
    if (this._connection !== null) {
      return;
    }

    const gl = backend.context;
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2BackdropBlendCompositor: could not create vertex array object.');
    }

    this._shader.connect(createWebGl2ShaderProgram(gl));

    const bufferHandles = new Map<WebGl2RenderBuffer, WebGLBuffer>();
    const indexBuffer = new WebGl2RenderBuffer(BufferTypes.ElementArrayBuffer, quadIndices, BufferUsage.StaticDraw).connect(
      this._createBufferRuntime(gl, bufferHandles),
    );
    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._vertexData, BufferUsage.DynamicDraw).connect(
      this._createBufferRuntime(gl, bufferHandles),
    );

    // Force shader finalize so getAttribute() below sees a populated attribute table.
    this._shader.sync();

    const vao = new WebGl2VertexArrayObject()
      .addIndex(indexBuffer)
      .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, vertexStrideBytes, 0)
      .addAttribute(vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.FLOAT, false, vertexStrideBytes, 8)
      .connect(this._createVaoRuntime(gl, vaoHandle));

    this._connection = { gl, vaoHandle, vao, indexBuffer, vertexBuffer, bufferHandles };
  }

  public disconnect(): void {
    const connection = this._connection;

    if (connection === null) {
      return;
    }

    connection.indexBuffer.destroy();
    connection.vertexBuffer.destroy();
    connection.vao.destroy();
    this._shader.disconnect();
    this._connection = null;
  }

  /**
   * Composite `source` over the active target's current contents under an
   * advanced (backdrop-aware) blend mode. Captures the target's `[x, y, width,
   * height]` region (view units) as the backdrop, runs the blend in a shader,
   * and draws the blended source over the untouched backdrop with normal
   * premultiplied source-over.
   */
  public compose(backend: WebGl2Backend, source: Texture | RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): void {
    if (this._connection === null) {
      throw new Error('WebGl2BackdropBlendCompositor: not connected.');
    }

    if (width <= 0 || height <= 0) {
      return;
    }

    const gl = backend.context;
    const target = backend.renderTarget;
    const scaleX = target.root && target.width > 0 ? gl.drawingBufferWidth / target.width : 1;
    const scaleY = target.root && target.height > 0 ? gl.drawingBufferHeight / target.height : 1;
    const px = Math.max(0, Math.floor(x * scaleX));
    const py = Math.max(0, Math.floor(gl.drawingBufferHeight - (y + height) * scaleY));
    const backdrop = backend.acquireRenderTexture(width, height);
    const cw = Math.min(backdrop.width, Math.max(0, Math.round(width * scaleX)));
    const ch = Math.min(backdrop.height, Math.max(0, Math.round(height * scaleY)));
    // An opaque framebuffer (the default alpha-less root canvas) reports a
    // captured backdrop alpha of 0; treat such a backdrop as fully covered.
    const opaqueBackdrop = target.root && !(gl.getContextAttributes()?.alpha ?? false);

    try {
      // Capture the target region into the backdrop via blit; copyTexSubImage2D
      // reads the opaque default framebuffer as black, so blit is the reliable
      // path for the on-screen root canvas.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, backend._renderTargetFramebuffer(target));
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, backend._renderTargetFramebuffer(backdrop));
      gl.blitFramebuffer(px, py, px + cw, py + ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      backend._rebindActiveTarget();

      this._drawBlend(backend, source, backdrop, x, y, width, height, blendMode, opaqueBackdrop);
    } finally {
      backend.releaseRenderTexture(backdrop);
    }
  }

  private _drawBlend(
    backend: WebGl2Backend,
    source: Texture | RenderTexture,
    backdrop: Texture | RenderTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: BlendModes,
    opaqueBackdrop: boolean,
  ): void {
    const connection = this._connection;

    if (connection === null) {
      throw new Error('WebGl2BackdropBlendCompositor: not connected.');
    }

    this._writeQuadVertices(x, y, x + width, y + height);

    backend.bindShader(this._shader);

    const projection = backend.view.getTransform().toArray(false);

    this._modeValue[0] = blendMode;
    this._opaqueValue[0] = opaqueBackdrop ? 1 : 0;
    this._shader.getUniform('u_projection').setValue(projection);
    this._shader.getUniform('u_source').setValue(this._sourceSamplerSlot);
    this._shader.getUniform('u_backdrop').setValue(this._backdropSamplerSlot);
    this._shader.getUniform('u_mode').setValue(this._modeValue);
    this._shader.getUniform('u_opaqueBackdrop').setValue(this._opaqueValue);
    this._shader.sync();

    backend.bindTexture(source, 0);
    backend.bindTexture(backdrop, 1);
    // The blend math is in the shader; composite the blended source over the
    // backdrop already in the target with normal premultiplied source-over.
    backend.setBlendMode(BlendModes.Normal);

    backend.bindVertexArrayObject(connection.vao);
    connection.vertexBuffer.upload(this._float32View);
    connection.vao.draw(6, 0);

    backend.stats.batches++;
    backend.stats.drawCalls++;

    backend.bindTexture(null, 1);
  }

  private _writeQuadVertices(left: number, top: number, right: number, bottom: number): void {
    const view = this._float32View;

    // Vertex 0: top-left (UV 0, 0)
    view[0] = left;
    view[1] = top;
    view[2] = 0;
    view[3] = 0;

    // Vertex 1: top-right (UV 1, 0)
    view[4] = right;
    view[5] = top;
    view[6] = 1;
    view[7] = 0;

    // Vertex 2: bottom-right (UV 1, 1)
    view[8] = right;
    view[9] = bottom;
    view[10] = 1;
    view[11] = 1;

    // Vertex 3: bottom-left (UV 0, 1)
    view[12] = left;
    view[13] = bottom;
    view[14] = 0;
    view[15] = 1;
  }

  private _createBufferRuntime(gl: WebGL2RenderingContext, handles: Map<WebGl2RenderBuffer, WebGLBuffer>): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2BackdropBlendCompositor: could not create render buffer.');
    }

    return {
      bind: (buffer: WebGl2RenderBuffer): void => {
        gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer: WebGl2RenderBuffer): void => {
        const data = buffer.data;

        gl.bindBuffer(buffer.type, handle);
        gl.bufferData(buffer.type, data, buffer.usage);
        handles.set(buffer, handle);
      },
      destroy: (buffer: WebGl2RenderBuffer): void => {
        gl.deleteBuffer(handle);
        handles.delete(buffer);
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

            gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            gl.enableVertexAttribArray(attribute.location);
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
          gl.drawElements(type, size, gl.UNSIGNED_SHORT, start);
        } else {
          gl.drawArrays(type, start, size);
        }
      },
      destroy: (vao: WebGl2VertexArrayObject): void => {
        gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }
}
