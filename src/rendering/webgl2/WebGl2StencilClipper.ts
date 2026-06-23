import { Matrix } from '#math/Matrix';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { GeometryAttribute } from '#rendering/geometry/GeometryAttribute';
import { Shader } from '#rendering/shader/Shader';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '#rendering/types';

import fragmentSource from './glsl/stencil-clip.frag';
import vertexSource from './glsl/stencil-clip.vert';
import type { WebGl2Backend } from './WebGl2Backend';
import { WebGl2RenderBuffer, type WebGl2RenderBufferRuntime } from './WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from './WebGl2ShaderProgram';
import { WebGl2VertexArrayObject, type WebGl2VertexArrayObjectRuntime } from './WebGl2VertexArrayObject';

const positionNames = new Set<string>(['a_position', 'position']);

// Two floats per vertex: position(x, y). Color is masked off during the draw,
// so no other attribute is needed.
const positionStrideBytes = 8;

interface StencilClipperConnection {
  readonly gl: WebGL2RenderingContext;
  readonly vao: WebGl2VertexArrayObject;
  readonly vertexBuffer: WebGl2RenderBuffer;
}

/**
 * Draws a {@link Geometry} silhouette into the stencil buffer for
 * {@link WebGl2Backend}'s geometric clip path. Positions are de-referenced
 * (indices expanded) into a tightly-packed `x, y` stream on the CPU and drawn
 * via `drawArrays`, so any interleaved source layout and index buffer is
 * supported without per-shape attribute reconfiguration.
 *
 * Intentionally not an {@link AbstractWebGl2Renderer}: like
 * {@link WebGl2MaskCompositor} it is invoked directly by the backend, outside
 * the renderer-registry dispatch path. The caller manages stencil/color-mask
 * state around the draw; this class only renders the shape.
 */
export class WebGl2StencilClipper {
  private readonly _shader: Shader = new Shader(vertexSource, fragmentSource);
  private readonly _matrix: Matrix = new Matrix();
  private _positions: Float32Array = new Float32Array(64);
  private _connection: StencilClipperConnection | null = null;

  public connect(backend: WebGl2Backend): void {
    if (this._connection !== null) {
      return;
    }

    const gl = backend.context;
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2StencilClipper: could not create vertex array object.');
    }

    this._shader.connect(createWebGl2ShaderProgram(gl));
    this._shader.sync();

    const vertexBuffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, this._positions, BufferUsage.DynamicDraw).connect(this._createBufferRuntime(gl));
    const vao = new WebGl2VertexArrayObject(RenderingPrimitives.Triangles)
      .addAttribute(vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, positionStrideBytes, 0)
      .connect(this._createVaoRuntime(gl, vaoHandle));

    this._connection = { gl, vao, vertexBuffer };
  }

  public disconnect(): void {
    const connection = this._connection;

    if (connection === null) {
      return;
    }

    connection.vertexBuffer.destroy();
    connection.vao.destroy();
    this._shader.disconnect();
    this._connection = null;
  }

  /**
   * Draw `shape` (transformed by `transform`, the clip node's global transform)
   * with the position-only stencil shader. The caller is responsible for
   * stencil func/op and color-mask state.
   */
  public draw(backend: WebGl2Backend, shape: Geometry, transform: Matrix): void {
    const connection = this._connection;

    if (connection === null) {
      throw new Error('WebGl2StencilClipper: not connected.');
    }

    const vertexCount = this._extractPositions(shape);

    if (vertexCount === 0) {
      return;
    }

    this._matrix.copy(transform).combine(backend.view.getTransform());

    backend.bindShader(this._shader);
    this._shader.getUniform('u_matrix').setValue(this._matrix.toArray(false));
    this._shader.sync();

    backend.bindVertexArrayObject(connection.vao);
    connection.vertexBuffer.upload(this._positions.subarray(0, vertexCount * 2));

    const mode = shape.topology === 'triangle-strip' ? RenderingPrimitives.TriangleStrip : RenderingPrimitives.Triangles;

    connection.vao.draw(vertexCount, 0, mode);

    backend.stats.drawCalls++;
  }

  private _extractPositions(shape: Geometry): number {
    const position = this._resolvePositionAttribute(shape.attributes);

    if (position.type !== 'f32') {
      throw new Error(`Stencil clipShape position attribute "${position.name}" must be of type f32 (got "${position.type}").`);
    }

    const { stride, vertexData, indices } = shape;
    const view = vertexData instanceof Float32Array ? new DataView(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength) : new DataView(vertexData);
    const drawCount = indices !== null ? indices.length : shape.vertexCount;

    this._ensureCapacity(drawCount);

    const out = this._positions;

    for (let i = 0; i < drawCount; i++) {
      // In-bounds: when `indices` is non-null, `drawCount === indices.length`.
      const vertexIndex = indices !== null ? indices[i]! : i;
      const base = vertexIndex * stride + position.offset;

      out[i * 2] = view.getFloat32(base, true);
      out[i * 2 + 1] = view.getFloat32(base + 4, true);
    }

    return drawCount;
  }

  private _resolvePositionAttribute(attributes: readonly GeometryAttribute[]): GeometryAttribute {
    const directMatch = attributes.find(attribute => positionNames.has(attribute.name));

    if (directMatch) {
      return directMatch;
    }

    const fuzzyMatch = attributes.find(attribute => attribute.name.toLowerCase().includes('position'));

    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    throw new Error('Stencil clipShape requires a position attribute named `a_position` or `position`.');
  }

  private _ensureCapacity(vertexCount: number): void {
    const requiredFloats = vertexCount * 2;

    if (this._positions.length < requiredFloats) {
      this._positions = new Float32Array(Math.max(requiredFloats, this._positions.length * 2));
    }
  }

  private _createBufferRuntime(gl: WebGL2RenderingContext): WebGl2RenderBufferRuntime {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2StencilClipper: could not create render buffer.');
    }

    return {
      bind: (buffer: WebGl2RenderBuffer): void => {
        gl.bindBuffer(buffer.type, handle);
      },
      upload: (buffer: WebGl2RenderBuffer): void => {
        gl.bindBuffer(buffer.type, handle);
        gl.bufferData(buffer.type, buffer.data, buffer.usage);
      },
      destroy: (buffer: WebGl2RenderBuffer): void => {
        gl.deleteBuffer(handle);
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

          appliedVersion = vao.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (_vao: WebGl2VertexArrayObject, size: number, start: number, type: number): void => {
        gl.drawArrays(type, start, size);
      },
      destroy: (vao: WebGl2VertexArrayObject): void => {
        gl.deleteVertexArray(vaoHandle);
        vao.disconnect();
      },
    };
  }
}
