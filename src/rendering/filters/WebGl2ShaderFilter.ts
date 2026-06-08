import { Color } from '@/core/Color';
import { BackendTargetPass } from '@/rendering/BackendTargetPass';
import type { RenderBackend } from '@/rendering/RenderBackend';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { Shader } from '@/rendering/shader/Shader';
import { upgradeFragmentShaderToGl300 } from '@/rendering/shader/upgradeFragmentShaderToGl300';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import { Texture } from '@/rendering/texture/Texture';
import { BufferTypes, BufferUsage, RenderingPrimitives } from '@/rendering/types';
import type { WebGl2Backend } from '@/rendering/webgl2/WebGl2Backend';
import { WebGl2RenderBuffer } from '@/rendering/webgl2/WebGl2RenderBuffer';
import { createWebGl2ShaderProgram } from '@/rendering/webgl2/WebGl2ShaderProgram';
import { WebGl2VertexArrayObject } from '@/rendering/webgl2/WebGl2VertexArrayObject';

import { Filter } from './Filter';

/**
 * A scalar number, vector tuple, typed array, or texture. Both
 * {@link WebGl2ShaderFilter} and {@link WebGpuShaderFilter} accept and
 * marshal these value types.
 */
export type ShaderFilterUniformValue =
  | number
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | Int32Array
  | Texture
  | RenderTexture;

export interface WebGl2ShaderFilterOptions {
  /**
   * GLSL fragment shader source. Required.
   *
   * The shader receives these auto-bound uniforms:
   *   uniform sampler2D uTexture;     // the filter's input
   *   uniform vec2 uResolution;        // output dimensions
   *
   * And these auto-bound varyings:
   *   in vec2 vUv;                     // 0..1 across the quad
   */
  fragmentSource?: string;

  /**
   * GLSL vertex shader source. Optional; defaults to a pass-through
   * fullscreen-quad shader.
   */
  vertexSource?: string;

  /**
   * Initial uniform values. Can be updated at runtime by writing
   * to the `uniforms` property:
   *
   *   filter.uniforms.uTime = performance.now() / 1000;
   */
  uniforms?: Record<string, ShaderFilterUniformValue>;

  /**
   * Auto-upgrade legacy GLSL ES 1.00 fragment shader source to GLSL ES 3.00.
   * Default `true` — accepts both Shadertoy/ISF/legacy shaders and modern
   * 3.00 shaders interchangeably.
   *
   * Set to `false` if you want strict 3.00 input (will fail to compile if
   * given 1.00-style code). Useful for CI/linting setups that want to catch
   * legacy shader code as bugs.
   *
   * Note: only the fragment shader is upgraded. If you supply a 1.00-style
   * vertex shader via `vertexSource`, you will get a compile error that
   * must be fixed manually.
   */
  autoUpgrade?: boolean;
}

/**
 * Default fullscreen-quad vertex shader. Positions are already in clip
 * space (-1..1), so no projection matrix is needed.
 */
const defaultVertexSource = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Interleaved position+UV data for a fullscreen TRIANGLE_STRIP quad.
 * Layout per vertex: [posX, posY, uvX, uvY]
 *
 * Vertices (clip-space positions, 0..1 UVs):
 *   0: bottom-left  (-1, -1, 0, 0)
 *   1: bottom-right ( 1, -1, 1, 0)
 *   2: top-left     (-1,  1, 0, 1)
 *   3: top-right    ( 1,  1, 1, 1)
 */
const quadVertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

/** Bytes per vertex: 2 floats position + 2 floats UV = 16 bytes */
const vertexStride = 16;

interface WebGl2Connection {
  readonly gl: WebGL2RenderingContext;
  readonly vertexBuffer: WebGl2RenderBuffer;
  readonly vao: WebGl2VertexArrayObject;
}

/**
 * A high-level {@link Filter} subclass that renders the input texture
 * through a user-provided GLSL fragment shader on the **WebGL2** backend.
 *
 * For the WebGPU backend use {@link WebGpuShaderFilter}.
 *
 * ## Usage
 *
 * ```ts
 * const filter = new WebGl2ShaderFilter({
 *   fragmentSource: `
 *     #version 300 es
 *     precision mediump float;
 *     uniform sampler2D uTexture;
 *     uniform vec2 uResolution;
 *     uniform float uTime;
 *     in vec2 vUv;
 *     out vec4 fragColor;
 *     void main() {
 *       fragColor = texture(uTexture, vUv);
 *     }
 *   `,
 *   uniforms: { uTime: 0.0 },
 * });
 *
 * // Update uniforms each frame:
 * filter.uniforms.uTime = performance.now() / 1000;
 * sprite.filters = [filter];
 * ```
 *
 * ## Auto-bound uniforms
 *
 * The backend automatically sets `uTexture` (slot 0) and `uResolution`
 * before each draw. User uniforms start at texture slot 1.
 */
export class WebGl2ShaderFilter extends Filter {
  /**
   * Mutable map of uniform values. Set values via property
   * assignment; they are flushed to the GPU before each apply().
   *
   *   filter.uniforms.uTime = 1.234;
   *   filter.uniforms.uColor = [1, 0.5, 0, 1];  // vec4
   */
  public readonly uniforms: Record<string, ShaderFilterUniformValue>;

  private readonly _fragmentSource: string;
  private readonly _vertexSource: string;

  private _shader: Shader | null = null;
  private _connection: WebGl2Connection | null = null;

  public constructor(options: WebGl2ShaderFilterOptions) {
    super();

    if (!options.fragmentSource) {
      throw new Error('WebGl2ShaderFilter requires fragmentSource for the WebGL2 backend.');
    }

    const autoUpgrade = options.autoUpgrade !== false;
    this._fragmentSource = autoUpgrade ? upgradeFragmentShaderToGl300(options.fragmentSource) : options.fragmentSource;
    this._vertexSource = options.vertexSource ?? defaultVertexSource;
    this.uniforms = { ...(options.uniforms ?? {}) };
  }

  /**
   * Execute the GLSL shader pass: compile the program on first call, bind
   * uniforms, and render the input texture into `output`. Throws if the
   * active backend is WebGPU — use {@link WebGpuShaderFilter} on WebGPU.
   */
  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture): void {
    if (backend.backendType === RenderBackendType.WebGpu) {
      throw new Error('WebGl2ShaderFilter requires the WebGL2 backend. Use WebGpuShaderFilter on WebGPU.');
    }

    const gl2Backend = backend as WebGl2Backend;

    this._ensureConnected(gl2Backend);

    const shader = this._shader!;

    backend.execute(
      new BackendTargetPass(
        b => {
          const gl2 = b as WebGl2Backend;

          // Bind shader (calls ShaderProgram.bind → gl.useProgram + sync dirty uniforms)
          gl2.bindShader(shader);

          // Auto-bind input texture to slot 0 (uTexture)
          gl2.bindTexture(input, 0);

          if (shader.uniforms.has('uTexture')) {
            shader.getUniform('uTexture').setValue(new Int32Array([0]));
          }

          // Auto-bind uResolution
          if (shader.uniforms.has('uResolution')) {
            shader.getUniform('uResolution').setValue(new Float32Array([output.width, output.height]));
          }

          // Sync user uniforms — texture uniforms start at slot 1
          let textureSlot = 1;

          for (const [name, value] of Object.entries(this.uniforms)) {
            if (!shader.uniforms.has(name)) {
              continue;
            }

            const uniform = shader.getUniform(name);

            if (value instanceof Texture) {
              gl2.bindTexture(value, textureSlot);
              uniform.setValue(new Int32Array([textureSlot]));
              textureSlot++;
            } else {
              uniform.setValue(this._marshalValue(value));
            }
          }

          // Flush dirty uniforms to the GPU
          shader.sync();

          // Draw the fullscreen quad
          const connection = this._connection!;

          gl2.bindVertexArrayObject(connection.vao);
          connection.vao.draw(4, 0, RenderingPrimitives.TriangleStrip);
        },
        {
          target: output,
          view: output.view,
          clearColor: Color.transparentBlack,
        },
      ),
    );
  }

  public override destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.vao.destroy();
      this._connection = null;
    }

    if (this._shader !== null) {
      this._shader.destroy();
      this._shader = null;
    }

    for (const key of Object.keys(this.uniforms)) {
      delete this.uniforms[key];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _ensureConnected(backend: WebGl2Backend): void {
    if (this._shader !== null) {
      return;
    }

    const gl = backend.context;

    // Create and connect the shader
    const shader = new Shader(this._vertexSource, this._fragmentSource);

    shader.connect(createWebGl2ShaderProgram(gl));

    // Force shader finalization so attributes are populated before VAO setup.
    // sync() calls finalize() internally, which blocks until compilation is
    // done and extracts attribute/uniform reflection data.
    shader.sync();

    // Build the fullscreen-quad vertex buffer (static, per-instance)
    const vaoHandle = gl.createVertexArray();

    if (vaoHandle === null) {
      throw new Error('WebGl2ShaderFilter: could not create vertex array object.');
    }

    const vertexBuffer = this._createVertexBuffer(gl);
    const vao = this._createVao(gl, vaoHandle, shader, vertexBuffer);

    this._shader = shader;
    this._connection = { gl, vertexBuffer, vao };
  }

  private _createVertexBuffer(gl: WebGL2RenderingContext): WebGl2RenderBuffer {
    const handle = gl.createBuffer();

    if (handle === null) {
      throw new Error('WebGl2ShaderFilter: could not create vertex buffer.');
    }

    const buffer = new WebGl2RenderBuffer(BufferTypes.ArrayBuffer, quadVertices, BufferUsage.StaticDraw);

    buffer.connect({
      bind: (): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      },
      upload: (buf, _offset): void => {
        gl.bindBuffer(gl.ARRAY_BUFFER, handle);
        gl.bufferData(gl.ARRAY_BUFFER, buf.data, buf.usage);
      },
      destroy: (buf): void => {
        gl.deleteBuffer(handle);
        buf.disconnect();
      },
    });

    return buffer;
  }

  private _createVao(gl: WebGL2RenderingContext, vaoHandle: WebGLVertexArrayObject, shader: Shader, vertexBuffer: WebGl2RenderBuffer): WebGl2VertexArrayObject {
    let appliedVersion = -1;

    const vao = new WebGl2VertexArrayObject(RenderingPrimitives.TriangleStrip);

    if (shader.attributes.has('aPosition')) {
      vao.addAttribute(vertexBuffer, shader.getAttribute('aPosition'), gl.FLOAT, false, vertexStride, 0);
    }

    if (shader.attributes.has('aUv')) {
      vao.addAttribute(vertexBuffer, shader.getAttribute('aUv'), gl.FLOAT, false, vertexStride, 8);
    }

    vao.connect({
      bind: (v): void => {
        gl.bindVertexArray(vaoHandle);

        if (appliedVersion !== v.version) {
          let lastBuffer: WebGl2RenderBuffer | null = null;

          for (const attribute of v.attributes) {
            const buf = attribute.buffer;

            if (lastBuffer !== buf) {
              buf.bind();
              lastBuffer = buf;
            }

            gl.vertexAttribPointer(attribute.location, attribute.size, attribute.type, attribute.normalized, attribute.stride, attribute.start);
            gl.enableVertexAttribArray(attribute.location);
          }

          appliedVersion = v.version;
        }
      },
      unbind: (): void => {
        gl.bindVertexArray(null);
      },
      draw: (_v, size, start, type): void => {
        gl.drawArrays(type, start, size);
      },
      destroy: (v): void => {
        gl.deleteVertexArray(vaoHandle);
        v.disconnect();
      },
    });

    return vao;
  }

  /**
   * Marshal a non-texture uniform value to a TypedArray suitable for
   * {@link ShaderUniform#setValue}.
   */
  private _marshalValue(value: Exclude<ShaderFilterUniformValue, Texture>): Float32Array | Int32Array {
    if (value instanceof Float32Array || value instanceof Int32Array) {
      return value;
    }

    if (typeof value === 'number') {
      return new Float32Array([value]);
    }

    // readonly tuple [a, b], [a, b, c], or [a, b, c, d]
    return new Float32Array(value as readonly number[]);
  }
}
